import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type SessionUser } from './auth.js'
import { db } from './db.js'
import { makeCode } from './invites.js'
import { leaderboardRoutes } from './leaderboard.js'
import { loadShoes, shoeRoutes } from './shoes.js'

/** Espace du coureur connecté. */
export const accountRoutes = new Hono<{ Variables: { user: SessionUser } }>()
accountRoutes.use('*', requireUser)
// Amis, synchro des totaux quotidiens et classements (semaine, mois, ville).
accountRoutes.route('/', leaderboardRoutes)

accountRoutes.get('/plans', async (c) => {
  const rows = await db`
    select id, title, goal_distance, to_char(goal_date, 'YYYY-MM-DD') goal_date, level, weeks, status, created_at
    from plans where user_id = ${c.get('user').id} order by created_at desc`
  return c.json(rows)
})

/** Réponses du dernier onboarding terminé du coureur : base de son espace (plan, analytics, équipement). */
accountRoutes.get('/overview', async (c) => {
  const userId = c.get('user').id
  const [session] = await db<{ id: string; answers: Record<string, unknown>; completed_at: Date | null; updated_at: Date }[]>`
    select id, answers, completed_at, updated_at from onboarding_sessions
    where user_id = ${userId} and not is_preview order by completed_at desc nulls last, updated_at desc limit 1`
  const plans = await db`
    select id, title, goal_distance, to_char(goal_date, 'YYYY-MM-DD') goal_date, level, weeks, sessions_per_week, status, created_at
    from plans where user_id = ${userId} order by created_at desc`
  const connections = await db<{ provider: string }[]>`select distinct provider from wearable_connections where user_id = ${userId}`
  // `shoes` : paires avec le kilométrage courant (saisi + sorties synchronisées depuis).
  const shoes = await loadShoes(userId, session ?? null)
  // `photoUpdatedAt` : photo envoyée depuis le profil (servie par /account/photo/:userId), sinon `answers.photoUrl`.
  const [photo] = await db<{ photo_updated_at: Date | null }[]>`select photo_updated_at from users where id = ${userId} and photo_data is not null`
  return c.json({
    answers: session?.answers ?? null,
    completedAt: session?.completed_at ?? null,
    plans,
    connections: connections.map((r) => r.provider),
    shoes,
    photoUpdatedAt: photo?.photo_updated_at ?? null,
  })
})

/** Code de parrainage du coureur (5 invitations), créé à la première demande. */
accountRoutes.get('/invite', async (c) => {
  const user = c.get('user')
  let [code] = await db<{ code: string; uses: number; max_uses: number | null }[]>`
    select code, uses, max_uses from invite_codes where owner_user_id = ${user.id} order by created_at limit 1`
  if (!code) {
    ;[code] = await db<{ code: string; uses: number; max_uses: number | null }[]>`
      insert into invite_codes (code, label, owner_user_id, max_uses)
      values (${makeCode(user.name.split(' ')[0] ?? '')}, ${`Parrainage de ${user.name}`}, ${user.id}, 5)
      returning code, uses, max_uses`
  }
  return c.json(code)
})

const CityBody = z.object({ city: z.string().trim().min(2).max(80) })

/**
 * Ville du coureur, modifiable depuis le Leaderboard sans refaire l'onboarding : rangée dans les réponses du
 * dernier onboarding (`city`, comme les chaussures) et recopiée sur le lead rattaché au compte.
 */
accountRoutes.put('/city', async (c) => {
  const parsed = CityBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Enter a city between 2 and 80 characters.' }, 400)
  const { city } = parsed.data
  const userId = c.get('user').id
  const [row] = await db<{ id: string }[]>`
    update onboarding_sessions set answers = answers || ${db.json({ city } as never)}, updated_at = now()
    where id = (
      select id from onboarding_sessions where user_id = ${userId} and not is_preview
      order by completed_at desc nulls last, updated_at desc limit 1
    )
    returning id`
  if (!row) return c.json({ error: 'Finish onboarding before adding your city.' }, 404)
  await db`update leads set city = ${city}, updated_at = now() where user_id = ${userId} or onboarding_session_id = ${row.id}`
  return c.json({ city })
})

const ProfileBody = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80),
    sex: z.enum(['f', 'm', 'x']).nullable(),
    birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 5).nullable(),
    level: z.enum(['debutant', 'intermediaire', 'confirme']).nullable(),
    city: z.string().trim().max(80),
  })
  .partial()

/**
 * Profil modifiable après l'onboarding (qui ne se refait pas) : prénom et nom sur le compte (`users.name`) et dans
 * `answers.identity`, sexe et année de naissance (`answers.about`), niveau et ville, recopiés sur le lead rattaché.
 */
accountRoutes.patch('/profile', async (c) => {
  const parsed = ProfileBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Check your name, year of birth and city.' }, 400)
  const p = parsed.data
  if (p.city !== undefined && p.city !== '' && p.city.length < 2) return c.json({ error: 'Enter a city between 2 and 80 characters.' }, 400)
  const user = c.get('user')
  const [session] = await db<{ id: string; answers: Record<string, unknown> }[]>`
    select id, answers from onboarding_sessions where user_id = ${user.id} and not is_preview
    order by completed_at desc nulls last, updated_at desc limit 1`
  const touchesAnswers = p.sex !== undefined || p.birthYear !== undefined || p.level !== undefined || p.city !== undefined
  if (touchesAnswers && !session) return c.json({ error: 'Finish onboarding before editing your profile.' }, 404)

  let name = user.name
  if (p.firstName !== undefined || p.lastName !== undefined) {
    const [first = '', ...rest] = user.name.trim().split(/\s+/)
    const identity = (session?.answers.identity ?? {}) as { firstName?: string; lastName?: string }
    const firstName = p.firstName ?? identity.firstName ?? first
    const lastName = p.lastName ?? identity.lastName ?? rest.join(' ')
    name = `${firstName} ${lastName}`.trim()
    if (name.length < 2) return c.json({ error: 'Enter your first name.' }, 400)
    await db`update users set name = ${name} where id = ${user.id}`
    await db`update leads set first_name = ${firstName}, last_name = ${lastName}, updated_at = now() where user_id = ${user.id}`
    if (session) session.answers.identity = { ...identity, firstName, lastName }
  }
  if (session) {
    const a = session.answers
    if (p.sex !== undefined || p.birthYear !== undefined) {
      const about = (a.about ?? {}) as Record<string, unknown>
      a.about = { sex: about.sex ?? null, birthYear: about.birthYear ?? null, ...(p.sex !== undefined && { sex: p.sex }), ...(p.birthYear !== undefined && { birthYear: p.birthYear }) }
    }
    if (p.level !== undefined) a.level = p.level
    if (p.city !== undefined) {
      if (p.city) a.city = p.city
      else delete a.city
    }
    await db`update onboarding_sessions set answers = ${db.json(a as never)}, updated_at = now() where id = ${session.id}`
    if (p.city !== undefined) await db`update leads set city = ${p.city || null}, updated_at = now() where user_id = ${user.id} or onboarding_session_id = ${session.id}`
  }
  return c.json({ ok: true, name })
})

// ---------- Photo de profil ----------

const PHOTO_MAX_BYTES = 100 * 1024
const PHOTO_DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/
const PhotoBody = z.object({ dataUrl: z.string().max(200_000) })

/** Photo recadrée et réduite côté navigateur (256 × 256), gardée en data URL sur le compte. */
accountRoutes.put('/photo', async (c) => {
  const parsed = PhotoBody.safeParse(await c.req.json().catch(() => null))
  const match = parsed.success ? PHOTO_DATA_URL.exec(parsed.data.dataUrl) : null
  if (!parsed.success || !match) return c.json({ error: 'Pick a JPEG, PNG or WebP image.' }, 400)
  if (Buffer.from(match[2], 'base64').length > PHOTO_MAX_BYTES) return c.json({ error: 'This photo is too large (100 KB max).' }, 413)
  const [row] = await db<{ photo_updated_at: Date }[]>`
    update users set photo_data = ${parsed.data.dataUrl}, photo_updated_at = now() where id = ${c.get('user').id} returning photo_updated_at`
  return c.json({ photoUpdatedAt: row.photo_updated_at })
})

/** Retire la photo du profil, y compris celle choisie à l'onboarding : l'avatar repasse aux initiales. */
accountRoutes.delete('/photo', async (c) => {
  const userId = c.get('user').id
  await db`update users set photo_data = null, photo_updated_at = now() where id = ${userId}`
  await db`
    update onboarding_sessions set answers = answers || ${db.json({ photoUrl: null } as never)}, updated_at = now()
    where user_id = ${userId} and not is_preview and answers ? 'photoUrl'`
  return c.json({ ok: true })
})

/** Image de la photo d'un coureur (réservé aux comptes connectés) ; l'URL porte `?v=` pour le cache. */
accountRoutes.get('/photo/:userId', async (c) => {
  const id = c.req.param('userId')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Photo not found' }, 404)
  const [row] = await db<{ photo_data: string | null }[]>`select photo_data from users where id = ${id}`
  const match = row?.photo_data ? PHOTO_DATA_URL.exec(row.photo_data) : null
  if (!match) return c.json({ error: 'Photo not found' }, 404)
  return c.body(Buffer.from(match[2], 'base64'), 200, {
    'content-type': match[1],
    'cache-control': 'private, max-age=31536000, immutable',
  })
})

// Paires de chaussures (Equipment) et leur kilométrage automatique : voir shoes.ts.
accountRoutes.route('/', shoeRoutes)
