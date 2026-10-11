import { Hono } from 'hono'
import { sql } from './db.js'

/**
 * État de l'app (plan, ressentis, records, réglages…) en un seul document JSON versionné.
 * Écriture optimiste : on ne remplace que si la version de départ est la bonne, sinon 409 + état courant.
 */
export const stateRoutes = new Hono()

type Row = { version: number; data: unknown; updated_at: Date }

stateRoutes.get('/', async (c) => {
  const [row] = await sql<Row[]>`select version, data, updated_at from app_state where id = 1`
  return c.json(row ?? { version: 0, data: null, updated_at: null })
})

stateRoutes.put('/', async (c) => {
  const { baseVersion, data } = await c.req.json<{ baseVersion: number; data: unknown }>()
  if (typeof baseVersion !== 'number' || data === null || typeof data !== 'object') return c.json({ error: 'Requête invalide.' }, 400)

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
  return c.json({ error: 'Conflit de version', current }, 409)
})
