import { Hono } from 'hono'
import { config } from './config.js'
import type { SessionUser } from './platform/auth.js'
import { budgetStatus, meterResponse, recordUsage } from './platform/ai-usage.js'

/**
 * Relais vers l'API Anthropic : la clé reste dans les variables d'environnement du serveur.
 * Seul l'endpoint Messages est ouvert ; la réponse (y compris le streaming SSE) est renvoyée telle quelle.
 * Chaque réponse est comptée (tokens, coût) et le relais s'arrête net quand le budget IA du mois est atteint.
 */
export const claudeRoutes = new Hono()

const FORWARDED_HEADERS = ['anthropic-version', 'anthropic-beta', 'content-type', 'accept']

claudeRoutes.post('/v1/messages', async (c) => {
  if (!config.anthropicKey) return c.json({ error: { message: 'ANTHROPIC_API_KEY n’est pas configurée sur le serveur.' } }, 500)
  const budget = await budgetStatus()
  if (budget.blocked) {
    // Même forme qu'une erreur Anthropic : le SDK l'affiche telle quelle.
    return c.json(
      { type: 'error', error: { type: 'budget_exceeded', message: `This month’s AI budget (€${budget.capEur}) is used up. Pacer is paused until next month or until an admin raises the budget.` } },
      402,
    )
  }
  const headers = new Headers({ 'x-api-key': config.anthropicKey })
  for (const h of FORWARDED_HEADERS) {
    const v = c.req.header(h)
    if (v) headers.set(h, v)
  }
  if (!headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01')

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: await c.req.arrayBuffer(),
    signal: c.req.raw.signal,
  })
  const out = new Headers()
  for (const h of ['content-type', 'request-id', 'retry-after', 'anthropic-ratelimit-requests-remaining']) {
    const v = upstream.headers.get(h)
    if (v) out.set(h, v)
  }
  out.set('cache-control', 'no-store')
  if (!upstream.ok || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers: out })
  // Une copie du flux sert au comptage, l'autre part au navigateur sans attendre.
  const [toClient, toMeter] = upstream.body.tee()
  const user = c.get('platformUser' as never) as SessionUser | undefined
  const isStream = (upstream.headers.get('content-type') ?? '').includes('event-stream')
  void meterResponse(toMeter, isStream, (model, usage) => recordUsage(user?.id ?? null, model, usage))
  return new Response(toClient, { status: upstream.status, headers: out })
})
