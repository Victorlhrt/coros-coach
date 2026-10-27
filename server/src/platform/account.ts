import { Hono } from 'hono'
import { requireUser, type SessionUser } from './auth.js'
import { db } from './db.js'

/** Espace du coureur connecté. */
export const accountRoutes = new Hono<{ Variables: { user: SessionUser } }>()
accountRoutes.use('*', requireUser)

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
  return c.json({ answers: session?.answers ?? null, completedAt: session?.completed_at ?? null, plans })
})
