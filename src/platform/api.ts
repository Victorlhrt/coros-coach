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
export type Me = { id: string; email: string; name: string; role: UserRole; status: UserStatus }

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
