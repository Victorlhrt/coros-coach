/** Appels à l'API du serveur (même origine, cookie de session httpOnly). */

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401) onUnauthorized()
    const message = (body as { error?: string | { message?: string } } | null)?.error
    throw new ApiError(res.status, typeof message === 'string' ? message : (message?.message ?? `Erreur serveur ${res.status}`), body)
  }
  return body as T
}
