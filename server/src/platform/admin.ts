import { Hono } from 'hono'
import { z } from 'zod'
import { requireAdmin, type SessionUser } from './auth.js'
import { audit, db, getSetting } from './db.js'

type Env = { Variables: { user: SessionUser } }

/** API du back office : tout est réservé aux administrateurs et chaque écriture est journalisée. */
export const adminRoutes = new Hono<Env>()
adminRoutes.use('*', requireAdmin)

const count = (rows: { n: number }[]) => rows[0]?.n ?? 0

adminRoutes.get('/overview', async (c) => {
  const [users, users30, usersPrev30, active7, waitlist] = await Promise.all([
    db<{ n: number }[]>`select count(*)::int n from users`,
    db<{ n: number }[]>`select count(*)::int n from users where created_at > now() - interval '30 days'`,
    db<{ n: number }[]>`select count(*)::int n from users where created_at between now() - interval '60 days' and now() - interval '30 days'`,
    db<{ n: number }[]>`select count(*)::int n from users where last_login_at > now() - interval '7 days'`,
    db<{ n: number }[]>`select count(*)::int n from users where status = 'waitlist'`,
  ])
  const [onb] = await db<{ started: number; completed: number }[]>`
    select count(*)::int started, count(completed_at)::int completed
    from onboarding_sessions where not is_preview and created_at > now() - interval '30 days'`
  const [plans, plans30, plansPrev30] = await Promise.all([
    db<{ n: number }[]>`select count(*)::int n from plans`,
    db<{ n: number }[]>`select count(*)::int n from plans where created_at > now() - interval '30 days'`,
    db<{ n: number }[]>`select count(*)::int n from plans where created_at between now() - interval '60 days' and now() - interval '30 days'`,
  ])

  // Douze dernières semaines (lundi), y compris les semaines vides.
  const signupsByWeek = await db<{ week: string; source: string; n: number }[]>`
    select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') week, source, count(*)::int n
    from users where created_at > date_trunc('week', now()) - interval '11 weeks'
    group by 1, 2 order by 1`
  const plansByGoal = await db<{ distance: string; level: string | null; n: number }[]>`
    select goal_distance distance, level, count(*)::int n from plans group by 1, 2`
  const statusSplit = await db<{ status: string; n: number }[]>`select status, count(*)::int n from users group by 1`

  return c.json({
    metrics: {
      users: count(users),
      users30: count(users30),
      usersPrev30: count(usersPrev30),
      active7: count(active7),
      waitlist: count(waitlist),
      onboardingStarted30: onb.started,
      onboardingCompleted30: onb.completed,
      plans: count(plans),
      plans30: count(plans30),
      plansPrev30: count(plansPrev30),
    },
    signupsByWeek,
    plansByGoal,
    statusSplit,
  })
})

// ---------- Inscriptions ----------

adminRoutes.get('/users', async (c) => {
  const status = c.req.query('status')
  const q = c.req.query('q')?.trim().toLowerCase()
  const rows = await db`
    select u.id, u.email, u.name, u.role, u.status, u.source, u.onboarding_variant, u.product_updates, u.notes,
           u.created_at, u.last_login_at, (select count(*)::int from plans p where p.user_id = u.id) plans
    from users u
    where (${status ?? null}::text is null or u.status = ${status ?? null})
      and (${q ?? null}::text is null or u.email like ${`%${q ?? ''}%`} or lower(u.name) like ${`%${q ?? ''}%`})
    order by u.created_at desc
    limit 1000`
  return c.json(rows)
})

const UserPatch = z.object({
  status: z.enum(['waitlist', 'active', 'suspended']).optional(),
  role: z.enum(['runner', 'admin']).optional(),
  notes: z.string().max(2000).nullable().optional(),
})

adminRoutes.patch('/users/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const parsed = UserPatch.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Requête invalide' }, 400)
  const patch = parsed.data
  if (id === me.id && (patch.role === 'runner' || (patch.status && patch.status !== 'active'))) {
    return c.json({ error: 'Tu ne peux pas retirer tes propres droits.' }, 400)
  }
  const [row] = await db`
    update users set
      status = coalesce(${patch.status ?? null}, status),
      role = coalesce(${patch.role ?? null}, role),
      notes = case when ${patch.notes !== undefined} then ${patch.notes ?? null} else notes end
    where id = ${id}
    returning id, email, status, role`
  if (!row) return c.json({ error: 'Compte introuvable' }, 404)
  if (patch.status === 'suspended') await db`delete from user_sessions where user_id = ${id}`
  await audit(me.id, 'user.update', row.email as string, patch)
  return c.json(row)
})

/** Suppression définitive (demande RGPD) : plans et sessions partent avec le compte. */
adminRoutes.delete('/users/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  if (id === me.id) return c.json({ error: 'Tu ne peux pas supprimer ton propre compte ici.' }, 400)
  const [row] = await db<{ email: string }[]>`delete from users where id = ${id} returning email`
  if (!row) return c.json({ error: 'Compte introuvable' }, 404)
  await audit(me.id, 'user.delete', row.email)
  return c.json({ ok: true })
})

adminRoutes.get('/export/users.csv', async (c) => {
  const rows = await db<Record<string, unknown>[]>`
    select email, name, role, status, source, onboarding_variant, product_updates, created_at, last_login_at
    from users order by created_at`
  const cols = ['email', 'name', 'role', 'status', 'source', 'onboarding_variant', 'product_updates', 'created_at', 'last_login_at']
  const cell = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(','), ...rows.map((r) => cols.map((k) => cell(r[k])).join(','))].join('\n')
  await audit(c.get('user').id, 'users.export', null, { rows: rows.length })
  c.header('content-type', 'text/csv; charset=utf-8')
  c.header('content-disposition', `attachment; filename="inscrits-${new Date().toISOString().slice(0, 10)}.csv"`)
  return c.body(csv)
})

// ---------- Onboardings ----------

const StepSchema = z.object({
  id: z.string().min(1).max(60),
  kind: z.enum(['choice', 'multi', 'number', 'date', 'text', 'days', 'coros']),
  title: z.string().min(1).max(200),
  help: z.string().max(400).optional(),
  field: z.string().min(1).max(60),
  options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1), hint: z.string().optional() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().max(20).optional(),
  optional: z.boolean().optional(),
})

const VariantBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(400).default(''),
  status: z.enum(['draft', 'live', 'archived']),
  weight: z.number().int().min(0).max(100),
  steps: z.array(StepSchema).min(1).max(30),
})

adminRoutes.get('/onboardings', async (c) => {
  const rows = await db`
    select v.id, v.name, v.description, v.status, v.weight, jsonb_array_length(v.steps)::int steps, v.updated_at,
           count(s.id) filter (where not s.is_preview)::int started,
           count(s.completed_at) filter (where not s.is_preview)::int completed,
           (select count(*)::int from users u where u.onboarding_variant = v.id) signups,
           (select count(*)::int from plans p join onboarding_sessions os on os.id = p.onboarding_session_id where os.variant_id = v.id) plans
    from onboarding_variants v
    left join onboarding_sessions s on s.variant_id = v.id
    group by v.id
    order by case v.status when 'live' then 0 when 'draft' then 1 else 2 end, v.created_at`
  return c.json(rows)
})

adminRoutes.get('/onboardings/:id', async (c) => {
  const id = c.req.param('id')
  const [variant] = await db`select * from onboarding_variants where id = ${id}`
  if (!variant) return c.json({ error: 'Parcours introuvable' }, 404)
  // Entonnoir : nombre de parcours ayant atteint au moins chaque étape.
  const reached = await db<{ step: number; n: number }[]>`
    select step_reached step, count(*)::int n from onboarding_sessions
    where variant_id = ${id} and not is_preview group by 1`
  const [totals] = await db<{ started: number; completed: number }[]>`
    select count(*)::int started, count(completed_at)::int completed
    from onboarding_sessions where variant_id = ${id} and not is_preview`
  const sessions = await db`
    select s.id, s.step_reached, s.completed_at, s.created_at, s.is_preview, s.answers, u.email
    from onboarding_sessions s left join users u on u.id = s.user_id
    where s.variant_id = ${id} order by s.created_at desc limit 50`
  return c.json({ variant, reached, totals, sessions })
})

adminRoutes.post('/onboardings', async (c) => {
  const body = z
    .object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/), from: z.string().optional() })
    .safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Identifiant invalide (minuscules, chiffres et tirets).' }, 400)
  const { id, from } = body.data
  const [source] = from ? await db<{ name: string; description: string; steps: unknown }[]>`select name, description, steps from onboarding_variants where id = ${from}` : []
  const [row] = await db`
    insert into onboarding_variants (id, name, description, status, weight, steps)
    values (${id}, ${source ? `${source.name} (copie)` : 'Nouveau parcours'}, ${source?.description ?? ''}, 'draft', 0,
            ${db.json((source?.steps ?? [{ id: 'distance', kind: 'text', title: 'Quel est ton objectif ?', field: 'goal' }]) as never)})
    on conflict (id) do nothing
    returning id`
  if (!row) return c.json({ error: 'Cet identifiant existe déjà.' }, 409)
  await audit(c.get('user').id, 'onboarding.create', id, { from: from ?? null })
  return c.json(row)
})

adminRoutes.put('/onboardings/:id', async (c) => {
  const id = c.req.param('id')
  const parsed = VariantBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · ') }, 400)
  const v = parsed.data
  const [row] = await db`
    update onboarding_variants
    set name = ${v.name}, description = ${v.description}, status = ${v.status}, weight = ${v.weight},
        steps = ${db.json(v.steps as never)}, updated_at = now()
    where id = ${id} returning id`
  if (!row) return c.json({ error: 'Parcours introuvable' }, 404)
  await audit(c.get('user').id, 'onboarding.update', id, { status: v.status, weight: v.weight, steps: v.steps.length })
  return c.json({ ok: true })
})

// ---------- Plans ----------

adminRoutes.get('/plans', async (c) => {
  const status = c.req.query('status')
  const rows = await db`
    select p.id, p.title, p.goal_distance, to_char(p.goal_date, 'YYYY-MM-DD') goal_date, p.level, p.weeks, p.sessions_per_week, p.status, p.model,
           p.created_at, u.email, u.name, os.variant_id
    from plans p join users u on u.id = p.user_id
    left join onboarding_sessions os on os.id = p.onboarding_session_id
    where (${status ?? null}::text is null or p.status = ${status ?? null})
    order by p.created_at desc limit 1000`
  return c.json(rows)
})

adminRoutes.get('/plans/:id', async (c) => {
  const [plan] = await db`
    select p.*, to_char(p.goal_date, 'YYYY-MM-DD') goal_date, u.email, u.name, os.variant_id
    from plans p join users u on u.id = p.user_id
    left join onboarding_sessions os on os.id = p.onboarding_session_id
    where p.id = ${c.req.param('id')}`
  return plan ? c.json(plan) : c.json({ error: 'Plan introuvable' }, 404)
})

adminRoutes.patch('/plans/:id', async (c) => {
  const parsed = z
    .object({ status: z.enum(['requested', 'generating', 'active', 'completed', 'archived', 'failed']) })
    .safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Statut invalide' }, 400)
  const [row] = await db`update plans set status = ${parsed.data.status}, updated_at = now() where id = ${c.req.param('id')} returning id`
  if (!row) return c.json({ error: 'Plan introuvable' }, 404)
  await audit(c.get('user').id, 'plan.update', c.req.param('id'), parsed.data)
  return c.json({ ok: true })
})

// ---------- Administration ----------

adminRoutes.get('/settings', async (c) => {
  const admins = await db`select id, email, name, last_login_at from users where role = 'admin' order by created_at`
  return c.json({ signupMode: await getSetting('signup_mode', 'open'), admins })
})

adminRoutes.put('/settings', async (c) => {
  const parsed = z.object({ signupMode: z.enum(['open', 'waitlist', 'closed']) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Réglage invalide' }, 400)
  await db`
    insert into app_settings (key, value, updated_at) values ('signup_mode', ${db.json(parsed.data.signupMode)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`
  await audit(c.get('user').id, 'settings.signup_mode', null, parsed.data)
  return c.json({ ok: true })
})

adminRoutes.get('/audit', async (c) => {
  const rows = await db`
    select a.id::text, a.action, a.target, a.details, a.created_at, u.email actor
    from audit_log a left join users u on u.id = a.actor_id
    order by a.created_at desc limit 200`
  return c.json(rows)
})
