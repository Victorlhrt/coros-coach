import { db, getSetting } from './db.js'

/**
 * Droits de chaque offre, partagés par le serveur et l'app (même forme que `Entitlements` dans src/platform/api.ts).
 * Tant que `billing_enforced` est coupé, ou pour les comptes d'accès anticipé et les admins, tout est ouvert.
 */
export type PlanId = 'free' | 'pro' | 'expert'

export type Entitlements = {
  /** Plans actifs autorisés (null = illimité). */
  maxPlans: number | null
  /** Sources de données (montre, Strava) autorisées (null = illimité). */
  maxSources: number | null
  weeklyReview: boolean
  coachChat: 'none' | 'limited' | 'unlimited'
  expertMode: boolean
}

const FULL: Entitlements = { maxPlans: null, maxSources: null, weeklyReview: true, coachChat: 'unlimited', expertMode: true }

const BY_PLAN: Record<PlanId, Entitlements> = {
  free: { maxPlans: 1, maxSources: 1, weeklyReview: false, coachChat: 'none', expertMode: false },
  pro: { maxPlans: null, maxSources: null, weeklyReview: true, coachChat: 'limited', expertMode: false },
  expert: FULL,
}

export type BillingUser = { plan: PlanId; early_access: boolean; role: string }

export function entitlementsFor(user: BillingUser, enforced: boolean): Entitlements {
  if (!enforced || user.early_access || user.role === 'admin') return FULL
  return BY_PLAN[user.plan] ?? BY_PLAN.free
}

export const billingEnforced = () => getSetting<boolean>('billing_enforced', false).then((v) => v === true)

/** Droits d'un compte, lus en base (offre + accès anticipé) ; `role` vient de la session (ADMIN_EMAILS fait foi). */
export async function userEntitlements(userId: string, role: string) {
  const [[row], enforced] = await Promise.all([
    db<{ plan: PlanId; early_access: boolean }[]>`select plan, early_access from users where id = ${userId}`,
    billingEnforced(),
  ])
  const user: BillingUser = { plan: row?.plan ?? 'free', early_access: row?.early_access ?? false, role }
  return { plan: user.plan, earlyAccess: user.early_access, enforced, entitlements: entitlementsFor(user, enforced) }
}
