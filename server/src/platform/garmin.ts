import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { requireUser, type SessionUser } from './auth.js'
import { db } from './db.js'
import { GARMIN_PREFIX, extractToken, jwtExpiry, lapsFromActivityFile, normalizeGarminActivities, type GarminActivity, type GarminLap } from './garmin-normalize.js'

/**
 * Garmin Connect par la clé « Personal API » de chaque coureur (lecture seule).
 * Le coureur crée la clé dans Garmin Connect (connect.garmin.com/app/settings/personalApiToken), la colle ici ;
 * elle est chiffrée (AES-256-GCM) dans `wearable_connections.tokens`. La clé s'échange contre un jeton d'accès
 * de 24 h (sans refresh token : on rééchange la clé), mis en cache chiffré sur la même ligne.
 *
 * Sources : developer.garmin.com/gc-developer-program/personal/personal-api et personal-faq,
 * spécification OpenAPI de la page swagger-docs, client Python officiel github.com/garmin/connect-personal-api-python.
 *
 * Passage futur à l'API partenaire OAuth de Garmin : seuls `garminTokenFor` (origine du jeton) et les routes de
 * connexion changent ; les lectures (`fetchGarminRuns`, `fetchGarminLaps`) prennent déjà un simple jeton Bearer.
 */

const BASE = 'https://personal.connectapi.garmin.com'
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token'
const TIMEOUT_MS = 15_000
/** Jeton renouvelé une heure avant son expiration (comme le client officiel). */
const REFRESH_WINDOW_MS = 60 * 60_000
const EXPIRED_MESSAGE = 'Key expired or revoked'

// ---------- Chiffrement de la clé ----------

let warned = false
/**
 * GARMIN_KEY_SECRET : 32 octets en base64. Sans elle, en production, Garmin est désactivé (503) ;
 * en dev, une clé est dérivée de DATABASE_URL pour pouvoir tester (les clés stockées ne survivent pas à un changement de base).
 */
function secret(): Buffer | null {
  const raw = process.env.GARMIN_KEY_SECRET
  if (raw) {
    const key = Buffer.from(raw, 'base64')
    if (key.length === 32) return key
    throw new Error('GARMIN_KEY_SECRET doit faire 32 octets encodés en base64')
  }
  if (process.env.NODE_ENV === 'production') return null
  if (!warned) {
    warned = true
    console.warn('[garmin] GARMIN_KEY_SECRET absent : clé de dev dérivée de DATABASE_URL')
  }
  return createHash('sha256').update(`raice-garmin-dev:${process.env.DATABASE_URL ?? ''}`).digest()
}

export function garminConfigured() {
  try {
    return secret() !== null
  } catch {
    return false
  }
}

function encrypt(plain: string) {
  const key = secret()
  if (!key) throw new GarminError(503, 'not_configured', 'Garmin isn’t available right now.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')}`
}

function decrypt(box: string) {
  const key = secret()
  if (!key) throw new GarminError(503, 'not_configured', 'Garmin isn’t available right now.')
  const buf = Buffer.from(box.replace(/^v1:/, ''), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

// ---------- Connexion stockée ----------

/** Contenu de `wearable_connections.tokens` pour provider = 'garmin'. */
export interface GarminTokens {
  kind: 'personal_api_key'
  /** Clé Personal API chiffrée. */
  key: string
  /** Expiration de la clé (choisie par le coureur à la création, ou plafonnée par le jeton), ISO. */
  keyExpiresAt: string | null
  /** Jeton d'accès 24 h chiffré, et son expiration (epoch ms). */
  access?: string | null
  accessExpiresAt?: number | null
  lastSyncAt?: string | null
  /** Clé refusée par Garmin : la connexion reste en base mais n'est plus lue. */
  error?: string | null
}

export interface GarminConnection {
  id: string
  user_id?: string | null
  onboarding_session_id?: string | null
  tokens: GarminTokens
}

export class GarminError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'invalid_key' | 'expired' | 'rate_limited' | 'unavailable' | 'not_configured' | 'not_connected' | 'not_found',
    message: string,
  ) {
    super(message)
  }
}

async function saveTokens(conn: GarminConnection, patch: Partial<GarminTokens>) {
  conn.tokens = { ...conn.tokens, ...patch }
  await db`update wearable_connections set tokens = ${db.json(conn.tokens as never)}, updated_at = now() where id = ${conn.id}`
}

/** Connexion Garmin d'un compte (la plus récente si l'onboarding en a rattaché une seconde). Celles des aperçus admin sont ignorées. */
export async function garminConnectionForUser(userId: string) {
  const [row] = await db<GarminConnection[]>`
    select w.id, w.user_id, w.onboarding_session_id, w.tokens from wearable_connections w
    where w.provider = 'garmin' and w.user_id = ${userId}
      and not exists (select 1 from onboarding_sessions s where s.id = w.onboarding_session_id and s.is_preview)
    order by w.updated_at desc limit 1`
  return row ?? null
}

export async function garminConnectionForSession(sessionId: string) {
  const [row] = await db<GarminConnection[]>`
    select id, user_id, onboarding_session_id, tokens from wearable_connections
    where provider = 'garmin' and onboarding_session_id = ${sessionId} order by updated_at desc limit 1`
  return row ?? null
}

// ---------- HTTP Garmin ----------

async function exchangeKey(apiKey: string) {
  let res: Response
  try {
    res = await fetch(BASE + TOKEN_PATH, {
      method: 'POST',
      headers: { Accept: '*/*', Authorization: `ApiKey ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new GarminError(502, 'unavailable', 'Garmin isn’t responding, try again in a moment.')
  }
  const text = await res.text()
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
    throw new GarminError(400, 'invalid_key', 'Garmin refused this key. Check you copied all of it, or create a new one.')
  }
  if (res.status === 429) throw new GarminError(429, 'rate_limited', 'Garmin is limiting requests, try again in a few minutes.')
  const token = res.ok ? extractToken(text) : null
  if (!token) throw new GarminError(502, 'unavailable', 'Garmin isn’t responding, try again in a moment.')
  // Le jeton vit 24 h ou jusqu'à l'expiration de la clé (FAQ Garmin).
  return { token, expiresAt: jwtExpiry(token) ?? Date.now() + 23 * 3600_000 }
}

/**
 * Jeton Bearer valide pour une connexion (rattachée à un compte ou à un parcours d'onboarding) :
 * celui en cache s'il a plus d'une heure devant lui, sinon un nouvel échange de la clé, réenregistré sur la ligne.
 * Une clé refusée marque la connexion en erreur (« Key expired or revoked »).
 */
export async function garminTokenFor(connection: GarminConnection, opts: { force?: boolean } = {}): Promise<string> {
  const t = connection.tokens
  if (t.error) throw new GarminError(401, 'expired', t.error)
  if (!opts.force && t.access && t.accessExpiresAt && t.accessExpiresAt - Date.now() > REFRESH_WINDOW_MS) {
    try {
      return decrypt(t.access)
    } catch {
      // Jeton illisible : on rééchange la clé.
    }
  }
  let apiKey: string
  try {
    apiKey = decrypt(t.key)
  } catch (e) {
    if (e instanceof GarminError) throw e
    // Clé illisible (GARMIN_KEY_SECRET changé) : le coureur doit la recoller.
    await saveTokens(connection, { error: EXPIRED_MESSAGE, access: null, accessExpiresAt: null })
    throw new GarminError(401, 'expired', EXPIRED_MESSAGE)
  }
  let fresh: { token: string; expiresAt: number }
  try {
    fresh = await exchangeKey(apiKey)
  } catch (e) {
    if (e instanceof GarminError && e.code === 'invalid_key') {
      await saveTokens(connection, { error: EXPIRED_MESSAGE, access: null, accessExpiresAt: null })
      throw new GarminError(401, 'expired', EXPIRED_MESSAGE)
    }
    throw e
  }
  const patch: Partial<GarminTokens> = { access: encrypt(fresh.token), accessExpiresAt: fresh.expiresAt }
  // Un jeton qui expire avant 24 h est plafonné par la clé : c'est alors sa vraie date d'expiration.
  if (fresh.expiresAt < Date.now() + 23 * 3600_000) patch.keyExpiresAt = new Date(fresh.expiresAt).toISOString()
  await saveTokens(connection, patch)
  return fresh.token
}

/** GET authentifié ; un 401 déclenche un seul rééchange de la clé. Les 429 / 5xx sont retentés une fois. */
async function garminGet(connection: GarminConnection, path: string, accept = 'application/json'): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const token = await garminTokenFor(connection, { force: attempt > 0 })
    let res: Response
    try {
      res = await fetch(BASE + path, { headers: { Accept: accept, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new GarminError(502, 'unavailable', 'Garmin isn’t responding, try again in a moment.')
    }
    if (res.ok) return res
    if (res.status === 401 && attempt === 0) continue
    if (res.status === 401) {
      await saveTokens(connection, { error: EXPIRED_MESSAGE, access: null, accessExpiresAt: null })
      throw new GarminError(401, 'expired', EXPIRED_MESSAGE)
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      const wait = Math.min(5, Number(res.headers.get('retry-after')) || 1)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    if (res.status === 404) throw new GarminError(404, 'not_found', 'Activity not found on Garmin.')
    if (res.status === 429) throw new GarminError(429, 'rate_limited', 'Garmin is limiting requests, try again in a few minutes.')
    throw new GarminError(502, 'unavailable', 'Garmin isn’t responding, try again in a moment.')
  }
}

// ---------- Lectures ----------

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const PAGE = 100
const MAX_PAGES = 10

/**
 * Sorties de course des `days` derniers jours, normalisées comme les activités COROS de l'app.
 * Utilisable pour une connexion de compte comme d'onboarding (l'aperçu de la montre s'en sert).
 */
export async function fetchGarminRuns(connection: GarminConnection, days: number): Promise<GarminActivity[]> {
  const end = new Date(Date.now() + 86_400_000)
  const start = new Date(Date.now() - Math.max(1, days) * 86_400_000)
  const raw: unknown[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      start: String(page * PAGE),
      limit: String(PAGE),
      startDate: isoDay(start),
      endDate: isoDay(end),
      activityType: 'running',
    })
    const res = await garminGet(connection, `/activitylist-service/activities/search/activities?${q}`)
    const body = (await res.json().catch(() => [])) as unknown
    const items = Array.isArray(body) ? body : []
    raw.push(...items)
    if (items.length < PAGE) break
  }
  const runs = normalizeGarminActivities(raw)
  await saveTokens(connection, { lastSyncAt: new Date().toISOString() }).catch(() => undefined)
  return runs
}

/** Tours d'une activité, lus dans son fichier FIT d'origine (le JSON Garmin ne donne que des splits agrégés par type). */
export async function fetchGarminLaps(connection: GarminConnection, activityId: string): Promise<GarminLap[]> {
  const id = activityId.replace(GARMIN_PREFIX, '')
  if (!/^\d+$/.test(id)) throw new GarminError(400, 'not_found', 'Invalid activity')
  const res = await garminGet(connection, `/download-service/files/activity/${id}`, 'application/zip, application/x-zip-compressed, application/octet-stream')
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength > 25 * 1024 * 1024) return []
  return lapsFromActivityFile(bytes)
}

// ---------- Validation et enregistrement d'une clé ----------

const EXPIRY_DAYS = [30, 90, 180, 365] as const
const ConnectBody = z.object({
  apiKey: z.string().trim().min(16).max(4096),
  /** Durée choisie à la création de la clé dans Garmin Connect (1 an conseillé). */
  expiryDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).optional(),
})

/** Échange la clé puis fait une lecture légère (dernière activité) : la clé est bonne et lit bien les activités. */
async function validateKey(apiKey: string, expiryDays: (typeof EXPIRY_DAYS)[number]) {
  const { token, expiresAt } = await exchangeKey(apiKey)
  const res = await fetch(`${BASE}/activitylist-service/activities/search/activities?start=0&limit=1`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null)
  if (!res) throw new GarminError(502, 'unavailable', 'Garmin isn’t responding, try again in a moment.')
  if (res.status === 401 || res.status === 403) throw new GarminError(400, 'invalid_key', 'Garmin refused this key. Check you copied all of it, or create a new one.')
  if (!res.ok) throw new GarminError(502, 'unavailable', 'Garmin isn’t responding, try again in a moment.')
  const chosen = Date.now() + expiryDays * 86_400_000
  const keyExpiresAt = new Date(expiresAt < Date.now() + 23 * 3600_000 ? expiresAt : chosen).toISOString()
  const tokens: GarminTokens = {
    kind: 'personal_api_key',
    key: encrypt(apiKey),
    keyExpiresAt,
    access: encrypt(token),
    accessExpiresAt: expiresAt,
    lastSyncAt: null,
    error: null,
  }
  return tokens
}

function fail(c: Context, e: unknown) {
  // 409 plutôt que 401 pour une clé refusée : côté app, 401 veut dire « session plateforme absente ».
  if (e instanceof GarminError) return c.json({ error: e.message, code: e.code }, (e.code === 'expired' ? 409 : e.status) as 400)
  console.error('[garmin]', e)
  return c.json({ error: 'Something went wrong with Garmin, try again in a moment.' }, 500)
}

function status(conn: GarminConnection | null) {
  if (!conn) return { connected: false, expiresAt: null, lastSyncAt: null, error: null }
  const t = conn.tokens
  return { connected: !t.error, expiresAt: t.keyExpiresAt ?? null, lastSyncAt: t.lastSyncAt ?? null, error: t.error ?? null }
}

/** Limite simple en mémoire (par clé), pour les essais de clé sans compte. */
const attempts = new Map<string, number[]>()
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  attempts.set(key, recent)
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.every((t) => now - t >= windowMs)) attempts.delete(k)
  return recent.length > max
}

// ---------- Routes du compte : /api/platform/account/garmin ----------

export const garminAccountRoutes = new Hono<{ Variables: { user: SessionUser } }>()
garminAccountRoutes.use('*', requireUser)

garminAccountRoutes.get('/status', async (c) => c.json(status(await garminConnectionForUser(c.get('user').id))))

garminAccountRoutes.post('/connect', async (c) => {
  if (!garminConfigured()) return c.json({ error: 'Garmin isn’t available right now.', code: 'not_configured' }, 503)
  const parsed = ConnectBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Paste the full key from Garmin Connect.', code: 'invalid_key' }, 400)
  const userId = c.get('user').id
  if (limited(`user:${userId}`, 10, 10 * 60_000)) return c.json({ error: 'Too many attempts, try again in a few minutes.', code: 'rate_limited' }, 429)
  try {
    const tokens = await validateKey(parsed.data.apiKey, parsed.data.expiryDays ?? 365)
    // Une seule connexion Garmin par compte : la nouvelle clé remplace l'ancienne (renouvellement).
    await db.begin(async (tx) => {
      await tx`delete from wearable_connections where provider = 'garmin' and user_id = ${userId}`
      await tx`insert into wearable_connections (provider, user_id, tokens) values ('garmin', ${userId}, ${tx.json(tokens as never)})`
    })
    cache.delete(userId)
    return c.json({ connected: true, expiresAt: tokens.keyExpiresAt })
  } catch (e) {
    return fail(c, e)
  }
})

garminAccountRoutes.delete('/connect', async (c) => {
  const userId = c.get('user').id
  await db`delete from wearable_connections where provider = 'garmin' and user_id = ${userId}`
  cache.delete(userId)
  return c.json({ connected: false })
})

/** Sorties gardées quelques minutes par coureur (l'accueil, Analytics et Fitness lisent en même temps). */
const cache = new Map<string, { at: number; days: number; runs: GarminActivity[] }>()
const CACHE_MS = 5 * 60_000
const lapsCache = new Map<string, GarminLap[]>()

garminAccountRoutes.get('/activities', async (c) => {
  const userId = c.get('user').id
  const days = Math.min(366, Math.max(1, Math.floor(Number(c.req.query('days') ?? 112)) || 112))
  const hit = cache.get(userId)
  const strip = (runs: GarminActivity[]) => {
    const from = isoDay(new Date(Date.now() - days * 86_400_000))
    return runs.filter((r) => r.date >= from)
  }
  if (hit && Date.now() - hit.at < CACHE_MS && hit.days >= days) return c.json(strip(hit.runs))
  const conn = await garminConnectionForUser(userId)
  if (!conn) return c.json({ error: 'Garmin isn’t connected.', code: 'not_connected' }, 404)
  try {
    const runs = await fetchGarminRuns(conn, days)
    cache.set(userId, { at: Date.now(), days, runs })
    return c.json(runs)
  } catch (e) {
    return fail(c, e)
  }
})

garminAccountRoutes.get('/activities/:id/laps', async (c) => {
  const userId = c.get('user').id
  const id = c.req.param('id').replace(GARMIN_PREFIX, '')
  const key = `${userId}:${id}`
  const hit = lapsCache.get(key)
  if (hit) return c.json(hit)
  const conn = await garminConnectionForUser(userId)
  if (!conn) return c.json({ error: 'Garmin isn’t connected.', code: 'not_connected' }, 404)
  try {
    const laps = await fetchGarminLaps(conn, id)
    if (lapsCache.size > 2000) lapsCache.clear()
    lapsCache.set(key, laps)
    return c.json(laps)
  } catch (e) {
    return fail(c, e)
  }
})

// ---------- Onboarding sans compte : POST /api/platform/connect/garmin ----------

export const garminOnboardingRoutes = new Hono()

const OnboardingBody = ConnectBody.extend({ sessionId: z.string().uuid() })

garminOnboardingRoutes.post('/', async (c) => {
  if (!garminConfigured()) return c.json({ error: 'Garmin isn’t available right now.', code: 'not_configured' }, 503)
  const parsed = OnboardingBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Paste the full key from Garmin Connect.', code: 'invalid_key' }, 400)
  const { sessionId, apiKey, expiryDays } = parsed.data
  const ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  if (limited(`session:${sessionId}`, 6, 10 * 60_000) || limited(`ip:${ip}`, 20, 10 * 60_000)) {
    return c.json({ error: 'Too many attempts, try again in a few minutes.', code: 'rate_limited' }, 429)
  }
  const [session] = await db<{ user_id: string | null; is_preview: boolean }[]>`
    select user_id, is_preview from onboarding_sessions where id = ${sessionId} and completed_at is null`
  if (!session) return c.json({ error: 'Onboarding session not found or already finished' }, 404)
  // Aperçu admin : la clé reste sur le parcours de test, jamais rattachée au compte de l'admin.
  const userId = session.is_preview ? null : session.user_id
  try {
    const tokens = await validateKey(apiKey, expiryDays ?? 365)
    // Rattachée au parcours ; l'inscription (auth.ts) ou la fin du parcours (onboarding.ts) la passe au compte.
    await db`
      insert into wearable_connections (provider, onboarding_session_id, user_id, tokens)
      values ('garmin', ${sessionId}, ${userId}, ${db.json(tokens as never)})
      on conflict (provider, onboarding_session_id) do update set tokens = excluded.tokens, updated_at = now()`
    return c.json({ connected: true, expiresAt: tokens.keyExpiresAt })
  } catch (e) {
    return fail(c, e)
  }
})
