import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type SessionUser } from './auth.js'
import { streamFromActivityFile, type ActivityStream } from './garmin-normalize.js'

/**
 * Courbes FC / vitesse d'une activité COROS : le MCP COROS ne donne que des tours, mais il fournit un lien de
 * téléchargement du fichier FIT (queryActivityFitFileDownloadUrls, appelé par le navigateur qui détient le jeton).
 * Le serveur télécharge ce fichier (le stockage COROS ne répond pas aux requêtes d'un autre site) et le lit.
 * Seuls des hôtes de stockage connus sont acceptés, pour que la route ne serve pas à joindre n'importe quelle adresse.
 */

const ALLOWED_HOSTS = [/(^|\.)coros\.com$/i, /(^|\.)coros\.cn$/i, /\.amazonaws\.com(\.cn)?$/i, /\.aliyuncs\.com$/i, /\.cloudfront\.net$/i, /\.myqcloud\.com$/i, /\.googleapis\.com$/i]
const MAX_BYTES = 25 * 1024 * 1024
const TIMEOUT_MS = 20_000

const Body = z.object({ url: z.string().url().max(4096), labelId: z.string().min(1).max(200) })

const cache = new Map<string, ActivityStream | null>()

export const activityStreamRoutes = new Hono<{ Variables: { user: SessionUser } }>()
activityStreamRoutes.use('*', requireUser)

activityStreamRoutes.post('/coros', async (c) => {
  const parsed = Body.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { url, labelId } = parsed.data
  const key = `${c.get('user').id}:${labelId}`
  if (cache.has(key)) return c.json(cache.get(key) ?? null)

  const target = new URL(url)
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.some((re) => re.test(target.hostname))) {
    console.error('[stream] hôte refusé', target.hostname)
    return c.json({ error: `Unexpected file host (${target.hostname}).` }, 400)
  }
  try {
    const res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return c.json({ error: `COROS file download failed (${res.status}).` }, 502)
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return c.json(null)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const stream = bytes.byteLength > MAX_BYTES ? null : await streamFromActivityFile(bytes)
    if (cache.size > 500) cache.clear()
    cache.set(key, stream)
    return c.json(stream)
  } catch (e) {
    console.error('[stream] coros', e instanceof Error ? e.message : e)
    return c.json({ error: 'COROS file couldn’t be read, try again in a moment.' }, 502)
  }
})
