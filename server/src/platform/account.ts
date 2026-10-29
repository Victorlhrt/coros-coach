import { Hono } from 'hono'
import { requireUser, type SessionUser } from './auth.js'
import { db } from './db.js'
import { makeCode } from './invites.js'
import { leaderboardRoutes } from './leaderboard.js'

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
  const [session] = await db<{ answers: Record<string, unknown>; completed_at: Date | null }[]>`
    select answers, completed_at from onboarding_sessions
    where user_id = ${userId} order by completed_at desc nulls last, updated_at desc limit 1`
  const plans = await db`
    select id, title, goal_distance, to_char(goal_date, 'YYYY-MM-DD') goal_date, level, weeks, sessions_per_week, status, created_at
    from plans where user_id = ${userId} order by created_at desc`
  const connections = await db<{ provider: string }[]>`select distinct provider from wearable_connections where user_id = ${userId}`
  return c.json({ answers: session?.answers ?? null, completedAt: session?.completed_at ?? null, plans, connections: connections.map((r) => r.provider) })
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

type Shoe = { brand: string; model: string; km: number; rotation: boolean }

/**
 * Paires de chaussures du coureur, modifiables depuis Equipment. Rangées dans les réponses du dernier
 * onboarding (`shoes`), avec `gear` gardé sur la première paire pour ce qui lit encore l'ancien champ.
 */
accountRoutes.put('/shoes', async (c) => {
  const body = await c.req.json<{ shoes?: unknown }>().catch(() => ({ shoes: undefined }))
  if (!Array.isArray(body.shoes) || body.shoes.length > 20) return c.json({ error: 'Invalid shoe list.' }, 400)
  const shoes: Shoe[] = []
  for (const s of body.shoes as Partial<Shoe>[]) {
    const brand = typeof s?.brand === 'string' ? s.brand.trim().slice(0, 60) : ''
    const km = Number(s?.km)
    if (!brand || !Number.isFinite(km) || km < 0 || km > 10000) return c.json({ error: 'Each pair needs a brand and a mileage between 0 and 10,000 km.' }, 400)
    shoes.push({ brand, model: typeof s.model === 'string' ? s.model.trim().slice(0, 80) : '', km: Math.round(km), rotation: !!s.rotation })
  }
  const first = shoes[0]
  const gear = first ? { brand: first.brand, model: first.model, shoeKm: first.km, rotation: first.rotation } : null
  const [row] = await db<{ id: string }[]>`
    update onboarding_sessions set answers = answers || ${db.json({ shoes, gear } as never)}, updated_at = now()
    where id = (
      select id from onboarding_sessions where user_id = ${c.get('user').id}
      order by completed_at desc nulls last, updated_at desc limit 1
    )
    returning id`
  if (!row) return c.json({ error: 'Finish onboarding before adding shoes.' }, 404)
  return c.json({ shoes })
})
