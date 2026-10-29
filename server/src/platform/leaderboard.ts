import { Hono } from 'hono'
import { z } from 'zod'
import type { SessionUser } from './auth.js'
import { db } from './db.js'
import { normalizeCode } from './invites.js'

/**
 * Classements entre coureurs : amis (ajoutés par e-mail ou code de parrainage) et coureurs de la même ville.
 * Les activités restent lues sur l'appareil (COROS) : l'app pousse seulement des totaux par jour.
 * Monté dans `accountRoutes`, qui exige déjà un coureur connecté (`requireUser`).
 */
export const leaderboardRoutes = new Hono<{ Variables: { user: SessionUser } }>()

/** Fuseau des bornes de semaine et de mois (la plateforme vit en France). */
const TZ = 'Europe/Paris'
/** Fenêtre acceptée pour la synchro : un peu plus que les 42 jours lus sur la montre. */
const SYNC_DAYS = 70

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const DailyBody = z.object({
  from: iso,
  days: z
    .array(
      z.object({
        date: iso,
        meters: z.number().min(0).max(400_000),
        seconds: z.number().min(0).max(86_400),
        runs: z.number().int().min(0).max(30),
      }),
    )
    .max(SYNC_DAYS + 5),
})

const dayMs = 86_400_000
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Totaux par jour des activités COROS du coureur. `from` est le premier jour couvert : les jours de la
 * fenêtre absents de la liste sont remis à zéro (activité supprimée sur la montre).
 */
leaderboardRoutes.post('/runs/daily', async (c) => {
  const parsed = DailyBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid daily totals.' }, 400)
  const userId = c.get('user').id
  const now = Date.now()
  const min = isoDay(now - SYNC_DAYS * dayMs)
  const max = isoDay(now + 2 * dayMs)
  const from = parsed.data.from < min ? min : parsed.data.from
  const byDay = new Map<string, { meters: number; seconds: number; runs: number }>()
  for (const d of parsed.data.days) {
    if (d.date < from || d.date > max || Number.isNaN(Date.parse(d.date))) continue
    const cur = byDay.get(d.date) ?? { meters: 0, seconds: 0, runs: 0 }
    byDay.set(d.date, { meters: cur.meters + Math.round(d.meters), seconds: cur.seconds + Math.round(d.seconds), runs: cur.runs + d.runs })
  }
  const rows = [...byDay].map(([day, t]) => ({ user_id: userId, day, ...t }))
  await db.begin(async (sql) => {
    await sql`delete from run_days where user_id = ${userId} and day >= ${from}::date and not (day = any(${rows.map((r) => r.day)}::date[]))`
    if (rows.length) {
      await sql`
        insert into run_days ${sql(rows, 'user_id', 'day', 'meters', 'seconds', 'runs')}
        on conflict (user_id, day) do update
        set meters = excluded.meters, seconds = excluded.seconds, runs = excluded.runs, updated_at = now()`
    }
  })
  return c.json({ ok: true, days: rows.length })
})

// ---------- Amis ----------

type FriendRow = { id: string; name: string; status: 'pending' | 'accepted'; incoming: boolean; since: Date }

leaderboardRoutes.get('/friends', async (c) => {
  const me = c.get('user').id
  const rows = await db<FriendRow[]>`
    select u.id, u.name, f.status, f.addressee_id = ${me} incoming, coalesce(f.accepted_at, f.created_at) since
    from friendships f
    join users u on u.id = case when f.requester_id = ${me} then f.addressee_id else f.requester_id end
    where ${me} in (f.requester_id, f.addressee_id) and u.status = 'active'
    order by since desc`
  const pick = (r: FriendRow) => ({ id: r.id, name: r.name, since: r.since })
  return c.json({
    friends: rows.filter((r) => r.status === 'accepted').map(pick),
    incoming: rows.filter((r) => r.status === 'pending' && r.incoming).map(pick),
    outgoing: rows.filter((r) => r.status === 'pending' && !r.incoming).map(pick),
  })
})

const AddBody = z.object({ email: z.string().trim().toLowerCase().email().max(200).optional(), code: z.string().trim().min(2).max(40).optional() })

/** Demande d'ami par e-mail ou code de parrainage ; si l'autre nous l'a déjà demandée, on accepte directement. */
leaderboardRoutes.post('/friends', async (c) => {
  const parsed = AddBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || (!parsed.data.email && !parsed.data.code)) return c.json({ error: 'Enter an email address or an invite code.' }, 400)
  const me = c.get('user').id
  const { email, code } = parsed.data
  const [target] = email
    ? await db<{ id: string; name: string }[]>`select id, name from users where email = ${email} and status = 'active'`
    : await db<{ id: string; name: string }[]>`
        select u.id, u.name from invite_codes i join users u on u.id = i.owner_user_id
        where i.code = ${normalizeCode(code ?? '')} and u.status = 'active'`
  if (!target) {
    return c.json({ error: email ? 'No runner with this email yet. Share your invite code with them.' : 'This code doesn’t belong to a runner.' }, 404)
  }
  if (target.id === me) return c.json({ error: 'That’s you.' }, 400)
  const [existing] = await db<{ requester_id: string; status: string }[]>`
    select requester_id, status from friendships
    where (requester_id = ${me} and addressee_id = ${target.id}) or (requester_id = ${target.id} and addressee_id = ${me})`
  if (existing?.status === 'pending' && existing.requester_id === target.id) {
    await db`update friendships set status = 'accepted', accepted_at = now() where requester_id = ${target.id} and addressee_id = ${me}`
    return c.json({ status: 'accepted', name: target.name })
  }
  if (existing) return c.json({ status: existing.status, name: target.name })
  await db`insert into friendships (requester_id, addressee_id) values (${me}, ${target.id}) on conflict do nothing`
  return c.json({ status: 'pending', name: target.name })
})

const uuid = z.string().uuid()

leaderboardRoutes.post('/friends/:id/accept', async (c) => {
  const id = uuid.safeParse(c.req.param('id'))
  if (!id.success) return c.json({ error: 'Unknown request.' }, 404)
  const [row] = await db`
    update friendships set status = 'accepted', accepted_at = now()
    where requester_id = ${id.data} and addressee_id = ${c.get('user').id} and status = 'pending'
    returning requester_id`
  return row ? c.json({ ok: true }) : c.json({ error: 'Unknown request.' }, 404)
})

/** Refuser, annuler une demande ou retirer un ami : la ligne disparaît dans les deux sens. */
leaderboardRoutes.delete('/friends/:id', async (c) => {
  const id = uuid.safeParse(c.req.param('id'))
  if (!id.success) return c.json({ error: 'Unknown friend.' }, 404)
  const me = c.get('user').id
  await db`delete from friendships where (requester_id = ${me} and addressee_id = ${id.data}) or (requester_id = ${id.data} and addressee_id = ${me})`
  return c.json({ ok: true })
})

// ---------- Classements ----------

type Period = 'week' | 'month'
type Totals = { id: string; name: string; meters: number; seconds: number; runs: number; synced: boolean; rank: number }

/** Semaine (lundi–dimanche) ou mois calendaire en cours, à Paris. */
async function bounds(period: Period) {
  const [b] = await db<{ start: string; end: string }[]>`
    with t as (select date_trunc(${period}, (now() at time zone ${TZ})::date::timestamp) s)
    select to_char(s, 'YYYY-MM-DD') "start", to_char(s + ${period === 'week' ? '1 week' : '1 month'}::interval - interval '1 day', 'YYYY-MM-DD') "end" from t`
  return b!
}

const periodOf = (raw: string | undefined): Period => (raw === 'month' ? 'month' : 'week')
/** Hors amis, on n'affiche que le prénom et l'initiale du nom. */
function shortName(name: string) {
  const [first = '', ...rest] = name.trim().split(/\s+/)
  const last = rest.at(-1)
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first
}
const pace = (r: { meters: number; seconds: number }) => (r.meters > 0 && r.seconds > 0 ? Math.round(r.seconds / (r.meters / 1000)) : null)

leaderboardRoutes.get('/leaderboard', async (c) => {
  const me = c.get('user').id
  const period = periodOf(c.req.query('period'))
  const { start, end } = await bounds(period)
  const rows = await db<Totals[]>`
    with ids as (
      select ${me}::uuid id
      union
      select case when requester_id = ${me} then addressee_id else requester_id end
      from friendships where status = 'accepted' and ${me} in (requester_id, addressee_id)
    ), totals as (
      select u.id, u.name,
        coalesce(sum(r.meters), 0)::int meters, coalesce(sum(r.seconds), 0)::int seconds, coalesce(sum(r.runs), 0)::int runs,
        exists (select 1 from run_days x where x.user_id = u.id) synced
      from ids join users u on u.id = ids.id and (u.status = 'active' or u.id = ${me})
      left join run_days r on r.user_id = u.id and r.day between ${start}::date and ${end}::date
      group by u.id, u.name
    )
    select *, rank() over (order by meters desc)::int rank from totals order by meters desc, runs desc, name`
  return c.json({ period, start, end, rows: rows.map((r) => ({ ...r, me: r.id === me, friend: r.id !== me, paceSecPerKm: pace(r) })) })
})

/** Ville déclarée à l'onboarding (`answers.city`), lue prudemment : texte, ou objet avec `name`. */
function cityOf(answers: Record<string, unknown> | null | undefined): string | null {
  const v = answers?.city
  const name = typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? (v as { name: string }).name : null
  return name?.trim() ? name.trim() : null
}
const cityKey = (city: string) => city.split(',')[0]!.trim().toLowerCase()

leaderboardRoutes.get('/leaderboard/city', async (c) => {
  const me = c.get('user').id
  const period = periodOf(c.req.query('period'))
  const [session] = await db<{ answers: Record<string, unknown> }[]>`
    select answers from onboarding_sessions
    where user_id = ${me} order by completed_at desc nulls last, updated_at desc limit 1`
  const city = cityOf(session?.answers)
  const { start, end } = await bounds(period)
  if (!city) return c.json({ period, start, end, city: null, runners: 0, rows: [] })
  const rows = await db<(Totals & { runners: number; n: number })[]>`
    with latest as (
      select distinct on (s.user_id) s.user_id, s.answers
      from onboarding_sessions s join users u on u.id = s.user_id and u.status = 'active'
      order by s.user_id, s.completed_at desc nulls last, s.updated_at desc
    ), members as (
      select user_id id from latest
      where lower(btrim(split_part(case jsonb_typeof(answers->'city') when 'string' then answers->>'city' when 'object' then answers->'city'->>'name' end, ',', 1))) = ${cityKey(city)}
      union select ${me}::uuid
    ), totals as (
      select u.id, u.name,
        coalesce(sum(r.meters), 0)::int meters, coalesce(sum(r.seconds), 0)::int seconds, coalesce(sum(r.runs), 0)::int runs, true synced
      from members m join users u on u.id = m.id
      left join run_days r on r.user_id = u.id and r.day between ${start}::date and ${end}::date
      group by u.id, u.name
    ), ranked as (
      select *, rank() over (order by meters desc)::int rank, row_number() over (order by meters desc, runs desc, name)::int n, count(*) over ()::int runners
      from totals where meters > 0 or id = ${me}
    )
    select * from ranked where n <= 50 or id = ${me} order by n`
  const friends = new Set(
    (
      await db<{ id: string }[]>`
        select case when requester_id = ${me} then addressee_id else requester_id end id
        from friendships where status = 'accepted' and ${me} in (requester_id, addressee_id)`
    ).map((r) => r.id),
  )
  return c.json({
    period,
    start,
    end,
    city,
    runners: rows[0]?.runners ?? 0,
    rows: rows.map(({ runners: _r, ...r }) => {
      const known = r.id === me || friends.has(r.id)
      return { ...r, name: known ? r.name : shortName(r.name), me: r.id === me, friend: friends.has(r.id), paceSecPerKm: pace(r) }
    }),
  })
})
