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
