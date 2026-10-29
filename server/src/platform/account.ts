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
    where user_id = ${userId} order by completed_at desc nulls last, updated_at desc limit 1`
  const plans = await db`
    select id, title, goal_distance, to_char(goal_date, 'YYYY-MM-DD') goal_date, level, weeks, sessions_per_week, status, created_at
    from plans where user_id = ${userId} order by created_at desc`
  const connections = await db<{ provider: string }[]>`select distinct provider from wearable_connections where user_id = ${userId}`
  // `shoes` : paires avec le kilométrage courant (saisi + sorties synchronisées depuis).
  const shoes = await loadShoes(userId, session ?? null)
  return c.json({ answers: session?.answers ?? null, completedAt: session?.completed_at ?? null, plans, connections: connections.map((r) => r.provider), shoes })
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
      select id from onboarding_sessions where user_id = ${userId}
      order by completed_at desc nulls last, updated_at desc limit 1
    )
    returning id`
  if (!row) return c.json({ error: 'Finish onboarding before adding your city.' }, 404)
  await db`update leads set city = ${city}, updated_at = now() where user_id = ${userId} or onboarding_session_id = ${row.id}`
  return c.json({ city })
})

// Paires de chaussures (Equipment) et leur kilométrage automatique : voir shoes.ts.
accountRoutes.route('/', shoeRoutes)
