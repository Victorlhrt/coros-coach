/** Appels à l'API de la plateforme (même origine, cookie de session httpOnly `psid`). */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/platform${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error
    throw new ApiError(res.status, message ?? `Erreur serveur ${res.status}`)
  }
  return body as T
}

export type UserRole = 'runner' | 'admin'
export type UserStatus = 'waitlist' | 'active' | 'suspended'
export type PlanId = 'free' | 'pro' | 'expert'
export type BillingInterval = 'month' | 'year'
/** Droits de l'offre (même forme que server/src/platform/entitlements.ts) ; null = illimité. */
export type Entitlements = {
  maxPlans: number | null
  maxSources: number | null
  weeklyReview: boolean
  coachChat: 'none' | 'limited' | 'unlimited'
  expertMode: boolean
}
export type Me = { id: string; email: string; name: string; role: UserRole; status: UserStatus; plan?: PlanId; entitlements?: Entitlements }
export type Billing = {
  configured: boolean
  plan: PlanId
  status: string | null
  interval: BillingInterval | null
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  hasCustomer: boolean
  enforced: boolean
  earlyAccess: boolean
  entitlements: Entitlements
}

export type CompleteKind = 'reason' | 'wearables' | 'identity' | 'goal' | 'estimate' | 'health' | 'gear' | 'generate'

export type OnboardingStep = {
  id: string
  kind: 'choice' | 'multi' | 'number' | 'date' | 'text' | 'days' | 'coros' | CompleteKind
  title: string
  help?: string
  field: string
  options?: { value: string; label: string; hint?: string }[]
  min?: number
  max?: number
  unit?: string
  optional?: boolean
}

export type Variant = {
  id: string
  name: string
  description: string
  status: 'draft' | 'live' | 'archived'
  weight: number
  steps: OnboardingStep[]
}
