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

function planDates(plan: Plan) {
  return [...new Set(plan.weeks.flatMap((w) => w.sessions.map((s) => s.date)))]
}

/** Crée le plan complet sur COROS (une seule écriture confirmée). */
export async function pushPlan(plan: Plan) {
  const now = today()
  if (plan.startDate < now) throw new Error('Le plan a déjà commencé : COROS n’accepte qu’un début entre aujourd’hui et J+14. Régénère le plan.')
  if (plan.startDate > addDays(now, 14)) throw new Error(`COROS n’accepte un plan qu’à partir de 14 jours avant son début (${plan.startDate}). Reviens plus tard.`)

  const inProgress = await corosRead('queryTrainingPlanLibrary', {}).catch(() => null)
  const hasOther = inProgress !== null && /plan\s*id|planId/i.test(JSON.stringify(inProgress))
  const args = createPlanArgs(plan)
  const result = await corosWrite(
    'createTrainingPlan',
    args,
    `Créer le plan « ${plan.name} » sur COROS : ${plan.weeks.length} semaines, ${args.courseList.length} séances, à partir du ${plan.startDate}.` +
      (hasOther ? ' Attention : un autre plan est déjà en cours sur COROS, les dates peuvent se chevaucher.' : '') +
      ' Le renforcement reste dans l’app (non pris en charge par COROS).',
  )
  if (result === null) return false

  const planId = await locatePlanId(plan, result)
  usePlan.getState().setCoros({ planId, created: true })
  usePlan.getState().markSynced(hashesFor(plan, planDates(plan)))
  return true
}

/** Envoie des jours précis. Crée le plan s'il n'existe pas encore sur COROS. */
export async function pushDays(plan: Plan, dates: string[], label: string) {
  const { coros } = usePlan.getState()
  if (!coros.created) return pushPlan(plan)
  if (!coros.planId) {
    throw new Error('Plan ID COROS introuvable : impossible de mettre à jour le plan. Ouvre /#/debug et vérifie queryTrainingPlanLibrary.')
  }
  const future = [...new Set(dates)].filter((d) => d >= today()).sort()
  if (future.length === 0) throw new Error('Ces jours sont passés : rien à envoyer.')

  const result = await corosWrite(
    'updateTrainingPlan',
    updateDaysArgs(plan, coros.planId, future),
    `Mettre à jour ${label} sur COROS (${future.length} jour${future.length > 1 ? 's' : ''}). Les jours déjà réalisés sont ignorés par COROS.`,
  )
  if (result === null) return false
  usePlan.getState().markSynced(hashesFor(plan, future))
  return true
}
