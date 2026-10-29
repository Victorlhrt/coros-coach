import { Hono } from 'hono'
import { z } from 'zod'
import type { SessionUser } from './auth.js'
import { db } from './db.js'

/**
 * Import de l'archive Strava du coureur (son propre export RGPD, lu dans le navigateur) : l'API Strava interdit
 * l'usage de ses données par une IA, on ne passe donc jamais par elle. L'app envoie le résumé (rangé dans les
 * réponses du dernier onboarding, `answers.strava`, comme à l'onboarding) et la liste des sorties des deux
 * dernières années, gardée dans `imported_activities` et rendue sous la forme des activités montre.
 * Monté dans `accountRoutes`, qui exige déjà un coureur connecté (`requireUser`).
 */
export const stravaImportRoutes = new Hono<{ Variables: { user: SessionUser } }>()

const PREFIX = 'strava:'
/** Profondeur gardée : deux ans, et au plus 1 000 sorties (la limite de 256 Ko du corps de requête suit). */
export const MAX_DAYS = 730
export const MAX_RUNS = 1000
const dayMs = 86_400_000

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const Summary = z.object({
  runs: z.number().int().min(0).max(100_000),
  since: iso.nullable(),
  recent: z.object({
    runs: z.number().int().min(0).max(1_000),
    km: z.number().min(0).max(50_000),
    weeklyKm: z.number().min(0).max(5_000),
    longestKm: z.number().min(0).max(1_000),
  }),
  performances: z
    .array(
      z.object({
        label: z.string().max(60),
        km: z.number().positive().max(1_000),
        elevation: z.number().min(0).max(50_000),
        seconds: z.number().positive().max(1_000_000),
        date: iso.optional(),
        source: z.literal('strava'),
      }),
    )
    .max(10),
})

const Run = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  date: iso,
  startMs: z.number().int().positive().nullable().optional(),
  name: z.string().max(120),
  trail: z.boolean().optional(),
  meters: z.number().min(1).max(400_000),
  movingSeconds: z.number().min(0).max(400_000),
  elapsedSeconds: z.number().min(0).max(400_000),
  avgHr: z.number().min(25).max(250).nullable().optional(),
  elevation: z.number().min(-1_000).max(30_000).optional(),
})

const ImportBody = z.object({ summary: Summary, runs: z.array(Run).max(MAX_RUNS) })

type Row = {
  label_id: string
  date: string
  started_at: Date | null
  name: string
  sport_type: number
  meters: number
  seconds: number
  avg_hr: number | null
}

/** Ligne stockée → forme `Activity` de l'app (src/lib/coros/activities.ts), plus le départ pour le dédoublonnage. */
function toActivity(r: Row) {
  return {
    labelId: r.label_id,
    sportType: r.sport_type,
    date: r.date,
    name: r.name,
    place: null,
    meters: r.meters || null,
    seconds: r.seconds || null,
    paceSecPerKm: r.seconds && r.meters ? Math.round(r.seconds / (r.meters / 1000)) : null,
    avgHr: r.avg_hr,
    startMs: r.started_at ? r.started_at.getTime() : null,
  }
}

/** Remplace l'import précédent : sorties des deux dernières années et résumé dans les réponses d'onboarding. */
stravaImportRoutes.put('/strava-import', async (c) => {
  const parsed = ImportBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'This Strava export could not be read.' }, 400)
  const userId = c.get('user').id
  const { summary } = parsed.data
  const min = new Date(Date.now() - MAX_DAYS * dayMs).toISOString().slice(0, 10)
  const max = new Date(Date.now() + 2 * dayMs).toISOString().slice(0, 10)
  const seen = new Set<string>()
  const rows = parsed.data.runs
    .filter((r) => r.date >= min && r.date <= max && !Number.isNaN(Date.parse(r.date)) && !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({
      user_id: userId,
      source: 'strava',
      label_id: `${PREFIX}${r.id}`,
      activity_date: r.date,
      started_at: r.startMs ? new Date(r.startMs) : null,
      name: r.name.slice(0, 120),
      sport_type: 100,
      trail: !!r.trail,
      meters: Math.round(r.meters),
      seconds: Math.round(r.movingSeconds || r.elapsedSeconds),
      elapsed_seconds: Math.round(r.elapsedSeconds || r.movingSeconds),
      avg_hr: r.avgHr ? Math.round(r.avgHr) : null,
      elevation_gain: Math.round(r.elevation ?? 0),
    }))

  const importedAt = new Date()
  let summarySaved = false
  await db.begin(async (sql) => {
    await sql`delete from imported_activities where user_id = ${userId} and source = 'strava'`
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250).map((r) => ({ ...r, imported_at: importedAt }))
      await sql`
        insert into imported_activities ${sql(
          chunk,
          'user_id',
          'source',
          'label_id',
          'activity_date',
          'started_at',
          'name',
          'sport_type',
          'trail',
          'meters',
          'seconds',
          'elapsed_seconds',
          'avg_hr',
          'elevation_gain',
          'imported_at',
        )}`
    }
    const [row] = await sql<{ id: string }[]>`
      update onboarding_sessions set answers = answers || ${sql.json({ strava: summary } as never)}, updated_at = now()
      where id = (
        select id from onboarding_sessions where user_id = ${userId} and not is_preview
        order by completed_at desc nulls last, updated_at desc limit 1
      )
      returning id`
    summarySaved = !!row
  })
  return c.json({ importedAt, runs: rows.length, summarySaved })
})

/** État de l'import : date, nombre de sorties gardées et résumé (réponses d'onboarding). */
stravaImportRoutes.get('/strava-import', async (c) => {
  const userId = c.get('user').id
  const [stats] = await db<{ imported_at: Date | null; runs: number; first: string | null; last: string | null }[]>`
    select max(imported_at) imported_at, count(*)::int runs,
      to_char(min(activity_date), 'YYYY-MM-DD') first, to_char(max(activity_date), 'YYYY-MM-DD') last
    from imported_activities where user_id = ${userId} and source = 'strava'`
  const [session] = await db<{ strava: unknown }[]>`
    select answers->'strava' strava from onboarding_sessions where user_id = ${userId} and not is_preview
    order by completed_at desc nulls last, updated_at desc limit 1`
  return c.json({
    importedAt: stats?.imported_at ?? null,
    runs: stats?.runs ?? 0,
    first: stats?.first ?? null,
    last: stats?.last ?? null,
    summary: session?.strava ?? null,
  })
})

/** Supprime l'import : sorties gardées et résumé des réponses d'onboarding. */
stravaImportRoutes.delete('/strava-import', async (c) => {
  const userId = c.get('user').id
  await db.begin(async (sql) => {
    await sql`delete from imported_activities where user_id = ${userId} and source = 'strava'`
    await sql`
      update onboarding_sessions set answers = answers - 'strava', updated_at = now()
      where id = (
        select id from onboarding_sessions where user_id = ${userId} and not is_preview
        order by completed_at desc nulls last, updated_at desc limit 1
      )`
  })
  return c.json({ ok: true })
})

/** Sorties importées des `days` derniers jours (112 par défaut), sous la forme `Activity`, plus récentes d'abord. */
stravaImportRoutes.get('/imported-activities', async (c) => {
  const days = Math.min(MAX_DAYS, Math.max(1, Number(c.req.query('days')) || 112))
  const rows = await db<Row[]>`
    select label_id, to_char(activity_date, 'YYYY-MM-DD') date, started_at, name, sport_type, meters, seconds, avg_hr
    from imported_activities
    where user_id = ${c.get('user').id} and activity_date >= current_date - ${days}::int
    order by activity_date desc, started_at desc nulls last`
  return c.json(rows.map(toActivity))
})
