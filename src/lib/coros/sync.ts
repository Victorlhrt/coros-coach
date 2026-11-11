import { addDays, today } from '@/lib/coach/dates'
import type { Plan, Session } from '@/lib/coach/schema'
import { usePlan } from '@/lib/store/plan'
import { corosRead, corosWrite } from './client'
import { createPlanArgs, dayHash, isPushable, updateDaysArgs } from './mapping'

export type SyncStatus = 'app-only' | 'synced' | 'modified' | 'not-sent'

export function syncStatus(plan: Plan, synced: Record<string, string>, session: Session): SyncStatus {
  if (!isPushable(session)) return 'app-only'
  const sent = synced[session.date]
  if (sent === undefined) return 'not-sent'
  return sent === dayHash(plan, session.date) ? 'synced' : 'modified'
}

/** Cherche un Plan ID (chaîne décimale 64 bits) dans une réponse COROS, au plus près du nom du plan. */
function findPlanId(node: unknown, name: string): string | null {
  if (typeof node === 'string') {
    const near = node.indexOf(name)
    const text = near >= 0 ? node.slice(Math.max(0, near - 400), near + 600) : node
    return text.match(/plan\s*id\D{0,10}(\d{6,})/i)?.[1] ?? null
  }
  if (Array.isArray(node)) {
    const named = node.find((x) => JSON.stringify(x).includes(name))
    for (const x of named ? [named, ...node] : node) {
      const r = findPlanId(x, name)
      if (r) return r
    }
    return null
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (/^plan_?id$/i.test(k) && (typeof v === 'string' || typeof v === 'number')) return String(v)
    }
    for (const v of Object.values(node)) {
      const r = findPlanId(v, name)
      if (r) return r
    }
  }
  return null
}

async function locatePlanId(plan: Plan, createResult: unknown) {
  const direct = findPlanId(createResult, plan.name)
  if (direct) return direct
  const library = await corosRead('queryTrainingPlanLibrary', { statusList: [0, 1] }).catch(() => null)
  return findPlanId(library, plan.name)
}

function hashesFor(plan: Plan, dates: string[]) {
  return Object.fromEntries(dates.map((d) => [d, dayHash(plan, d)]))
}

/**
 * Premier envoi : crée sur COROS le calendrier du plan (semaines à venir, phases) avec les seules séances
 * envoyées ; les autres n'arrivent sur la montre que lorsqu'on les envoie à leur tour.
 */
async function createWithDays(plan: Plan, dates: string[], label: string) {
  const now = today()
  if (plan.startDate > addDays(now, 14)) throw new Error(`COROS only accepts sessions from 14 days before your plan starts (${plan.startDate}). Come back later.`)
  // COROS refuse un début dans le passé : un plan déjà commencé part d'aujourd'hui.
  const start = plan.startDate < now ? now : plan.startDate
  if (plan.raceDate < start) throw new Error('Your plan is over: nothing left to send.')

  const inProgress = await corosRead('queryTrainingPlanLibrary', {}).catch(() => null)
  const hasOther = inProgress !== null && /plan\s*id|planId/i.test(JSON.stringify(inProgress))
  const full = createPlanArgs(plan, start)
  const args = { ...full, courseList: full.courseList.filter((c) => dates.includes(addDays(start, c.dayNo))) }
  if (args.courseList.length === 0) throw new Error('Nothing to send: strength sessions stay in the app (COROS doesn’t support them).')
  const result = await corosWrite(
    'createTrainingPlan',
    args,
    `Send ${label} to COROS (${args.courseList.length} session${args.courseList.length > 1 ? 's' : ''}). It appears in your watch’s training calendar.` +
      (hasOther ? ' Heads-up: another plan is already running on COROS, dates may overlap.' : ''),
  )
  if (result === null) return false

  const planId = await locatePlanId(plan, result)
  usePlan.getState().setCoros({ planId, created: true, startDate: start })
  usePlan.getState().markSynced(hashesFor(plan, dates))
  return true
}

/** Envoie des séances précises sur la montre (jours passés ignorés). */
export async function pushDays(plan: Plan, dates: string[], label: string) {
  const { coros } = usePlan.getState()
  const future = [...new Set(dates)].filter((d) => d >= today()).sort()
  if (future.length === 0) throw new Error('These days are in the past: nothing to send.')
  if (!coros.created) return createWithDays(plan, future, label)
  if (!coros.planId) {
    throw new Error('COROS plan ID not found: can’t update the plan. Open /#/debug and check queryTrainingPlanLibrary.')
  }

  const result = await corosWrite(
    'updateTrainingPlan',
    updateDaysArgs(plan, coros.planId, future, coros.startDate),
    `Send ${label} to COROS (${future.length} day${future.length > 1 ? 's' : ''}).`,
  )
  if (result === null) return false
  usePlan.getState().markSynced(hashesFor(plan, future))
  return true
}
