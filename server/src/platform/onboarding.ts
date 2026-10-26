import { Hono } from 'hono'
import { z } from 'zod'
import { currentUser } from './auth.js'
import { db } from './db.js'
import type { OnboardingStep } from './onboarding-defaults.js'

type Variant = { id: string; name: string; description: string; status: string; weight: number; steps: OnboardingStep[] }

const DISTANCE_LABELS: Record<string, string> = { '5k': '5 km', '10k': '10 km', half: 'Semi-marathon', marathon: 'Marathon', trail: 'Trail' }

/** Demande de plan créée à la fin d'un onboarding, dès qu'un compte y est rattaché (une seule par parcours). */
export async function createPlanFromSession(sessionId: string, userId: string) {
  const [s] = await db<{ answers: Record<string, unknown>; completed_at: Date | null }[]>`
    select answers, completed_at from onboarding_sessions where id = ${sessionId}`
  if (!s?.completed_at) return
  const [existing] = await db`select 1 from plans where onboarding_session_id = ${sessionId}`
  if (existing) return

  const a = s.answers
  const distance = typeof a.distance === 'string' ? a.distance : 'unknown'
  const raceDate = typeof a.race_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.race_date) ? a.race_date : null
  const days = Array.isArray(a.days) ? a.days.length : null
  const weeks = raceDate ? Math.max(1, Math.round((Date.parse(raceDate) - Date.now()) / (7 * 86400_000))) : null
  await db`
    insert into plans (user_id, onboarding_session_id, title, goal_distance, goal_date, level, weeks, sessions_per_week, status, data)
    values (${userId}, ${sessionId}, ${`Préparation ${DISTANCE_LABELS[distance] ?? distance}`}, ${distance}, ${raceDate},
            ${typeof a.level === 'string' ? a.level : null}, ${weeks}, ${days}, 'requested', ${db.json({ answers: a } as never)})`
}

export const onboardingRoutes = new Hono()

/** Tire un parcours `live` au hasard selon les poids (test A/B). `?variant=` force un parcours, même brouillon (aperçu). */
onboardingRoutes.get('/pick', async (c) => {
  const forced = c.req.query('variant')
  if (forced) {
    const [v] = await db<Variant[]>`select id, name, description, status, weight, steps from onboarding_variants where id = ${forced} and status <> 'archived'`
    return v ? c.json(v) : c.json({ error: 'Parcours introuvable' }, 404)
  }
  const live = await db<Variant[]>`select id, name, description, status, weight, steps from onboarding_variants where status = 'live' and weight > 0`
  if (!live.length) return c.json({ error: 'Aucun parcours actif' }, 404)
  const total = live.reduce((sum, v) => sum + v.weight, 0)
  let r = Math.random() * total
  const picked = live.find((v) => (r -= v.weight) < 0) ?? live[0]
  return c.json(picked)
})

const StartBody = z.object({ variantId: z.string().min(1), preview: z.boolean().optional() })
const ProgressBody = z.object({ answers: z.record(z.string(), z.unknown()), stepReached: z.number().int().min(0).max(100) })

onboardingRoutes.post('/sessions', async (c) => {
  const parsed = StartBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Requête invalide' }, 400)
  const user = await currentUser(c)
  const [row] = await db<{ id: string }[]>`
    insert into onboarding_sessions (variant_id, user_id, is_preview)
    values (${parsed.data.variantId}, ${user?.id ?? null}, ${parsed.data.preview ?? false})
    returning id`
  return c.json(row)
})

onboardingRoutes.patch('/sessions/:id', async (c) => {
  const parsed = ProgressBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Requête invalide' }, 400)
  const { answers, stepReached } = parsed.data
  const [row] = await db`
    update onboarding_sessions
    set answers = ${db.json(answers as never)}, step_reached = greatest(step_reached, ${stepReached}), updated_at = now()
    where id = ${c.req.param('id')} and completed_at is null
    returning id`
  return row ? c.json({ ok: true }) : c.json({ error: 'Parcours introuvable ou terminé' }, 404)
})

onboardingRoutes.post('/sessions/:id/complete', async (c) => {
  const id = c.req.param('id')
  const user = await currentUser(c)
  const [row] = await db<{ user_id: string | null; is_preview: boolean }[]>`
    update onboarding_sessions
    set completed_at = coalesce(completed_at, now()), user_id = coalesce(user_id, ${user?.id ?? null}), updated_at = now()
    where id = ${id}
    returning user_id, is_preview`
  if (!row) return c.json({ error: 'Parcours introuvable' }, 404)
  if (row.user_id && !row.is_preview) await createPlanFromSession(id, row.user_id)
  return c.json({ ok: true, needsAccount: !row.user_id })
})
