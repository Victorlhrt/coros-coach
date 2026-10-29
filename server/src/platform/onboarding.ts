import { Hono } from 'hono'
import { z } from 'zod'
import { currentUser } from './auth.js'
import { db } from './db.js'
import { validCode } from './invites.js'
import { resumeHandler } from './resume.js'
import type { OnboardingStep } from './onboarding-defaults.js'

type Variant = { id: string; name: string; description: string; status: string; weight: number; steps: OnboardingStep[] }

const DISTANCE_LABELS: Record<string, string> = { '5k': '5 km', '10k': '10 km', half: 'Half marathon', marathon: 'Marathon', trail: 'Trail' }

/** Demande de plan créée à la fin d'un onboarding, dès qu'un compte y est rattaché (une seule par parcours). */
export async function createPlanFromSession(sessionId: string, userId: string) {
  const [s] = await db<{ answers: Record<string, unknown>; completed_at: Date | null }[]>`
    select answers, completed_at from onboarding_sessions where id = ${sessionId}`
  if (!s?.completed_at) return
  const [existing] = await db`select 1 from plans where onboarding_session_id = ${sessionId}`
  if (existing) return

  const a = s.answers
  const distance = typeof a.distance === 'string' ? a.distance : 'unknown'
  const raceDate = typeof a.race_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.race_date) ? a.race_date : null
  const days = Array.isArray(a.days) ? a.days.length : null
  const weeks = raceDate ? Math.max(1, Math.round((Date.parse(raceDate) - Date.now()) / (7 * 86400_000))) : null
  await db`
    insert into plans (user_id, onboarding_session_id, title, goal_distance, goal_date, level, weeks, sessions_per_week, status, data)
    values (${userId}, ${sessionId}, ${`${DISTANCE_LABELS[distance] ?? distance} plan`}, ${distance}, ${raceDate},
            ${typeof a.level === 'string' ? a.level : null}, ${weeks}, ${days}, 'requested', ${db.json({ answers: a } as never)})`
}

export const onboardingRoutes = new Hono()

// Reprise d'un parcours depuis le lien signé de l'e-mail de relance.
onboardingRoutes.get('/resume', resumeHandler)

/** Tire un parcours `live` au hasard selon les poids (test A/B). `?variant=` force un parcours, même brouillon (aperçu). */
onboardingRoutes.get('/pick', async (c) => {
  const forced = c.req.query('variant')
  if (forced) {
    const [v] = await db<Variant[]>`select id, name, description, status, weight, steps from onboarding_variants where id = ${forced} and status <> 'archived'`
    return v ? c.json(v) : c.json({ error: 'Onboarding flow not found' }, 404)
  }
  const live = await db<Variant[]>`select id, name, description, status, weight, steps from onboarding_variants where status = 'live' and weight > 0`
  if (!live.length) return c.json({ error: 'No active onboarding flow' }, 404)
  const total = live.reduce((sum, v) => sum + v.weight, 0)
  let r = Math.random() * total
  const picked = live.find((v) => (r -= v.weight) < 0) ?? live[0]
  return c.json(picked)
})

const StartBody = z.object({ variantId: z.string().min(1), preview: z.boolean().optional(), inviteCode: z.string().max(60).optional() })
const ProgressBody = z.object({
  answers: z.record(z.string(), z.unknown()),
  stepReached: z.number().int().min(0).max(100),
  stepId: z.string().max(40).optional(),
})
const LeadBody = z.object({
  sessionId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
})

/** Ville et photo choisies, reprises des réponses sur la fiche lead. */
const answerText = (a: Record<string, unknown>, key: string) => {
  const v = a[key]
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null
}

/**
 * Lead capté à la première étape (prénom, nom, e-mail) : une fiche par e-mail, mise à jour si la personne recommence.
 * Les aperçus des admins ne créent pas de lead.
 */
onboardingRoutes.post('/leads', async (c) => {
  const parsed = LeadBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Check your name and email.' }, 400)
  const { sessionId, firstName, lastName, email } = parsed.data
  const [s] = await db<{ is_preview: boolean; invite_code: string | null; user_id: string | null; step_reached: number }[]>`
    select is_preview, invite_code, user_id, step_reached from onboarding_sessions where id = ${sessionId} and completed_at is null`
  if (!s) return c.json({ error: 'Onboarding session not found' }, 404)
  if (s.is_preview) return c.json({ ok: true, preview: true })
  const [existingUser] = await db<{ id: string }[]>`select id from users where email = ${email}`
  await db`
    insert into leads (email, first_name, last_name, source, invite_code, onboarding_session_id, step_reached, last_step, user_id)
    values (${email}, ${firstName}, ${lastName}, ${s.invite_code ? 'invite' : 'onboarding'}, ${s.invite_code}, ${sessionId},
            ${s.step_reached}, 'identity', ${s.user_id ?? existingUser?.id ?? null})
    on conflict (email) do update set
      first_name = excluded.first_name, last_name = excluded.last_name,
      invite_code = coalesce(excluded.invite_code, leads.invite_code),
      onboarding_session_id = excluded.onboarding_session_id,
      user_id = coalesce(leads.user_id, excluded.user_id),
      updated_at = now()`
  return c.json({ ok: true })
})

onboardingRoutes.post('/sessions', async (c) => {
  const parsed = StartBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const user = await currentUser(c)
  // Sur invitation : un code valide est demandé, sauf aux coureurs déjà inscrits et aux aperçus des admins.
  const preview = !!parsed.data.preview && user?.role === 'admin'
  const code = await validCode(parsed.data.inviteCode)
  if (!user && !code) return c.json({ error: 'Invite code is invalid or used up' }, 403)
  // L'onboarding ne se fait qu'une fois : ensuite, le profil se modifie depuis l'espace coureur (aperçus admin exceptés).
  if (user && !preview) {
    const [done] = await db`select 1 from onboarding_sessions where user_id = ${user.id} and completed_at is not null and not is_preview limit 1`
    if (done) return c.json({ error: 'You’ve already completed onboarding. Edit your profile instead.', onboarded: true }, 409)
  }
  const [row] = await db<{ id: string }[]>`
    insert into onboarding_sessions (variant_id, user_id, is_preview, invite_code)
    values (${parsed.data.variantId}, ${user?.id ?? null}, ${preview}, ${code?.code ?? null})
    returning id`
  return c.json(row)
})

onboardingRoutes.patch('/sessions/:id', async (c) => {
  const parsed = ProgressBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { answers, stepReached, stepId } = parsed.data
  const [row] = await db`
    update onboarding_sessions
    set answers = ${db.json(answers as never)}, step_reached = greatest(step_reached, ${stepReached}),
        last_step_id = coalesce(${stepId ?? null}, last_step_id), updated_at = now()
    where id = ${c.req.param('id')} and completed_at is null
    returning id`
  if (!row) return c.json({ error: 'Onboarding session not found or already finished' }, 404)
  // Avancement du lead rattaché à ce parcours (s'il y en a un).
  await db`
    update leads set
      step_reached = greatest(step_reached, ${stepReached}),
      last_step = coalesce(${stepId ?? null}, last_step),
      city = coalesce(${answerText(answers, 'city')}, city),
      photo_url = case when ${'photoUrl' in answers} then ${answerText(answers, 'photoUrl')} else photo_url end,
      updated_at = now()
    where onboarding_session_id = ${c.req.param('id')}`
  return c.json({ ok: true })
})

onboardingRoutes.post('/sessions/:id/complete', async (c) => {
  const id = c.req.param('id')
  const user = await currentUser(c)
  const [row] = await db<{ user_id: string | null; is_preview: boolean; invite_code: string | null; first: boolean }[]>`
    update onboarding_sessions s
    set completed_at = coalesce(s.completed_at, now()), user_id = coalesce(s.user_id, ${user?.id ?? null}), updated_at = now()
    from (select completed_at is null first from onboarding_sessions where id = ${id}) before
    where s.id = ${id}
    returning s.user_id, s.is_preview, s.invite_code, before.first`
  if (!row) return c.json({ error: 'Onboarding flow not found' }, 404)
  // Un usage du code est compté une fois, à la fin du parcours.
  if (row.first && row.invite_code && !row.is_preview) await db`update invite_codes set uses = uses + 1 where code = ${row.invite_code}`
  await db`
    update leads set completed_at = coalesce(completed_at, now()), last_step = 'completed', user_id = coalesce(user_id, ${row.user_id}), updated_at = now()
    where onboarding_session_id = ${id}`
  if (row.user_id && !row.is_preview) {
    await createPlanFromSession(id, row.user_id)
    await db`update wearable_connections set user_id = ${row.user_id} where onboarding_session_id = ${id} and user_id is null`
  }
  return c.json({ ok: true, needsAccount: !row.user_id })
})
