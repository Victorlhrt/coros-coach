import { Hono } from 'hono'
import { config } from './config.js'

/**
 * Relais vers l'API Anthropic : la clé reste dans les variables d'environnement du serveur.
 * Seul l'endpoint Messages est ouvert ; la réponse (y compris le streaming SSE) est renvoyée telle quelle.
 */
export const claudeRoutes = new Hono()

const FORWARDED_HEADERS = ['anthropic-version', 'anthropic-beta', 'content-type', 'accept']

claudeRoutes.post('/v1/messages', async (c) => {
  if (!config.anthropicKey) return c.json({ error: { message: 'ANTHROPIC_API_KEY n’est pas configurée sur le serveur.' } }, 500)
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
  return new Response(upstream.body, { status: upstream.status, headers: out })
})
