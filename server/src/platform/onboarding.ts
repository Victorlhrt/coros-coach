import { Hono } from 'hono'
import { z } from 'zod'
import { currentUser } from './auth.js'
import { db } from './db.js'
import { validCode } from './invites.js'
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

const StartBody = z.object({ variantId: z.string().min(1), preview: z.boolean().optional(), inviteCode: z.string().max(60).optional() })
const ProgressBody = z.object({ answers: z.record(z.string(), z.unknown()), stepReached: z.number().int().min(0).max(100) })

onboardingRoutes.post('/sessions', async (c) => {
  const parsed = StartBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Requête invalide' }, 400)
  const user = await currentUser(c)
  // Sur invitation : un code valide est demandé, sauf aux coureurs déjà inscrits et aux aperçus des admins.
  const preview = !!parsed.data.preview && user?.role === 'admin'
  const code = await validCode(parsed.data.inviteCode)
  if (!user && !code) return c.json({ error: 'Code d’invitation invalide ou épuisé' }, 403)
  const [row] = await db<{ id: string }[]>`
    insert into onboarding_sessions (variant_id, user_id, is_preview, invite_code)
    values (${parsed.data.variantId}, ${user?.id ?? null}, ${preview}, ${code?.code ?? null})
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
  const [row] = await db<{ user_id: string | null; is_preview: boolean; invite_code: string | null; first: boolean }[]>`
    update onboarding_sessions s
    set completed_at = coalesce(s.completed_at, now()), user_id = coalesce(s.user_id, ${user?.id ?? null}), updated_at = now()
    from (select completed_at is null first from onboarding_sessions where id = ${id}) before
    where s.id = ${id}
    returning s.user_id, s.is_preview, s.invite_code, before.first`
  if (!row) return c.json({ error: 'Parcours introuvable' }, 404)
  // Un usage du code est compté une fois, à la fin du parcours.
  if (row.first && row.invite_code && !row.is_preview) await db`update invite_codes set uses = uses + 1 where code = ${row.invite_code}`
  if (row.user_id && !row.is_preview) {
    await createPlanFromSession(id, row.user_id)
    await db`update wearable_connections set user_id = ${row.user_id} where onboarding_session_id = ${id} and user_id is null`
  }
  return c.json({ ok: true, needsAccount: !row.user_id })
})
