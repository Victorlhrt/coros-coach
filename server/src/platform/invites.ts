import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { config } from '../config.js'
import { db } from './db.js'
import { sendEmailLater } from './email.js'
import { waitlistJoined } from './emails/templates.js'

/**
 * Accès sur invitation. Un code valide ouvre l'onboarding ; sans code, on rejoint la liste d'attente
 * et on reçoit un lien de parrainage : chaque ami inscrit avec ce lien fait remonter dans la liste.
 */
export const inviteRoutes = new Hono()

export const normalizeCode = (code: string) => code.trim().toLowerCase()

type Code = { code: string; max_uses: number | null; uses: number; active: boolean }

/** Code utilisable : actif et pas encore épuisé. */
export async function validCode(raw: string | null | undefined): Promise<Code | null> {
  if (!raw) return null
  const [row] = await db<Code[]>`select code, max_uses, uses, active from invite_codes where code = ${normalizeCode(raw)}`
  return row && row.active && (row.max_uses === null || row.uses < row.max_uses) ? row : null
}

/** Code court et lisible (sans 0/o ni 1/l), préfixé par le prénom quand on l'a. */
export function makeCode(prefix: string, length = 4) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const tail = Array.from(randomBytes(length), (b) => alphabet[b % alphabet.length]).join('')
  const head = prefix
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 10)
  return head ? `${head}-${tail}` : tail
}

/** Rang dans la liste : les parrainages d'abord, puis l'ancienneté. */
async function status(refCode: string) {
  const [row] = await db<{ first_name: string; ref_code: string; referrals: number; position: number; total: number; invited: boolean }[]>`
    with ranked as (
      select ref_code, first_name, referrals, invited_at is not null invited,
             row_number() over (order by referrals desc, created_at asc)::int position, count(*) over ()::int total
      from waitlist where invited_at is null or ref_code = ${refCode}
    )
    select * from ranked where ref_code = ${refCode}`
  return row ?? null
}

inviteRoutes.post('/check', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { code?: string } | null
  const code = await validCode(body?.code)
  return c.json(code ? { valid: true, code: code.code } : { valid: false })
})

const JoinBody = z.object({ email: z.string().trim().toLowerCase().email().max(200), firstName: z.string().trim().max(60).default(''), ref: z.string().trim().max(40).optional() })

inviteRoutes.post('/waitlist', async (c) => {
  const parsed = JoinBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid email address' }, 400)
  const { email, firstName, ref } = parsed.data
  const [existing] = await db<{ ref_code: string }[]>`select ref_code from waitlist where email = ${email}`
  let refCode = existing?.ref_code
  if (!refCode) {
    refCode = makeCode(firstName)
    const referrer = ref ? normalizeCode(ref) : null
    await db`insert into waitlist (email, first_name, ref_code, referred_by) values (${email}, ${firstName}, ${refCode}, ${referrer})`
    if (referrer) await db`update waitlist set referrals = referrals + 1 where ref_code = ${referrer}`
  }
  const st = await status(refCode)
  if (!existing && st) {
    sendEmailLater(email, 'waitlist-joined', waitlistJoined({ name: firstName, position: st.position, shareUrl: `${config.origin}/onboarding?ref=${refCode}` }))
  }
  return c.json({ refCode, ...st })
})

inviteRoutes.get('/waitlist/:ref', async (c) => {
  const st = await status(normalizeCode(c.req.param('ref')))
  return st ? c.json({ refCode: st.ref_code, ...st }) : c.json({ error: 'Unknown link' }, 404)
})
