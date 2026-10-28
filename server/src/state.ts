import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { isAuthenticated } from './auth.js'
import { config } from './config.js'
import { sql } from './db.js'
import { currentUser, type SessionUser } from './platform/auth.js'
import { db } from './platform/db.js'

/**
 * État du coach (plan, ressentis, records, réglages…) en un seul document JSON versionné.
 * Écriture optimiste : on ne remplace que si la version de départ est la bonne, sinon 409 + état courant.
 *
 * Un coureur connecté à la plateforme a son propre état (table coach_state). L'ancien accès par passkey
 * au coach personnel garde l'état historique (app_state), repris une fois par le compte COACH_OWNER_EMAIL.
 */
export const stateRoutes = new Hono()

type Row = { version: number; data: unknown; updated_at: Date | null }

/** Accès au coach : compte de la plateforme (actif) ou session passkey du coach personnel. */
export const requireCoachAccess: MiddlewareHandler = async (c, next) => {
  const user = await currentUser(c)
  if (user && user.status === 'active') {
    c.set('platformUser' as never, user as never)
    return next()
  }
  if (await isAuthenticated(c)) return next()
  return c.json({ error: 'Not logged in' }, 401)
}

const platformUser = (c: Context) => c.get('platformUser' as never) as SessionUser | undefined

/** Première ouverture du propriétaire : copie de l'état du coach personnel dans son compte. */
async function adoptLegacyState(user: SessionUser) {
  if (user.email.toLowerCase() !== config.coachOwnerEmail) return
  const [legacy] = await sql<Row[]>`select version, data from app_state where id = 1`
  if (!legacy?.data) return
  await db`insert into coach_state (user_id, version, data) values (${user.id}, 1, ${db.json(legacy.data as never)}) on conflict (user_id) do nothing`
}

async function readUserState(user: SessionUser): Promise<Row> {
  let [row] = await db<Row[]>`select version, data, updated_at from coach_state where user_id = ${user.id}`
  if (!row) {
    await adoptLegacyState(user)
    ;[row] = await db<Row[]>`select version, data, updated_at from coach_state where user_id = ${user.id}`
  }
  return row ?? { version: 0, data: null, updated_at: null }
}

stateRoutes.get('/', async (c) => {
  const user = platformUser(c)
  if (user) return c.json(await readUserState(user))
  const [row] = await sql<Row[]>`select version, data, updated_at from app_state where id = 1`
  return c.json(row ?? { version: 0, data: null, updated_at: null })
})

stateRoutes.put('/', async (c) => {
  const { baseVersion, data } = await c.req.json<{ baseVersion: number; data: unknown }>()
  if (typeof baseVersion !== 'number' || data === null || typeof data !== 'object') return c.json({ error: 'Invalid request.' }, 400)

  const user = platformUser(c)
  if (user) {
    const json = db.json(data as never)
    const [row] =
      baseVersion === 0
        ? await db<Row[]>`
            insert into coach_state (user_id, version, data) values (${user.id}, 1, ${json})
            on conflict (user_id) do nothing
            returning version, data, updated_at`
        : await db<Row[]>`
            update coach_state set version = version + 1, data = ${json}, updated_at = now()
            where user_id = ${user.id} and version = ${baseVersion}
            returning version, data, updated_at`
    if (row) return c.json({ version: row.version, updated_at: row.updated_at })
    return c.json({ error: 'Version conflict', current: await readUserState(user) }, 409)
  }

  const json = sql.json(data as Parameters<typeof sql.json>[0])
  const [row] =
    baseVersion === 0
      ? await sql<Row[]>`
          insert into app_state (id, version, data) values (1, 1, ${json})
          on conflict (id) do nothing
          returning version, data, updated_at`
      : await sql<Row[]>`
          update app_state set version = version + 1, data = ${json}, updated_at = now()
          where id = 1 and version = ${baseVersion}
          returning version, data, updated_at`
  if (row) return c.json({ version: row.version, updated_at: row.updated_at })

  const [current] = await sql<Row[]>`select version, data, updated_at from app_state where id = 1`
  return c.json({ error: 'Version conflict', current }, 409)
})
