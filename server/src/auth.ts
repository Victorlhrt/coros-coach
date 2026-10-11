import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { config } from './config.js'
import { sql } from './db.js'

const SESSION_COOKIE = 'sid'
const CHALLENGE_COOKIE = 'wchal'
const SESSION_DAYS = 180
const USER_ID = new TextEncoder().encode('coach-coros-owner')

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const cookieOpts = { httpOnly: true, secure: config.production, sameSite: 'Lax' as const, path: '/' }

export async function isAuthenticated(c: Context) {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return false
  const [row] = await sql`select 1 from sessions where token_hash = ${hash(token)} and expires_at > now()`
  return !!row
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!(await isAuthenticated(c))) return c.json({ error: 'Non connecté' }, 401)
  await next()
}

async function startSession(c: Context) {
  const token = randomBytes(32).toString('base64url')
  await sql`insert into sessions (token_hash, expires_at) values (${hash(token)}, now() + ${`${SESSION_DAYS} days`}::interval)`
  setCookie(c, SESSION_COOKIE, token, { ...cookieOpts, maxAge: SESSION_DAYS * 86400 })
}

async function saveChallenge(c: Context, challenge: string) {
  const id = randomBytes(16).toString('base64url')
  await sql`insert into challenges (id, challenge, expires_at) values (${id}, ${challenge}, now() + interval '5 minutes')`
  setCookie(c, CHALLENGE_COOKIE, id, { ...cookieOpts, maxAge: 300 })
}

/** Challenge à usage unique : supprimé dès qu'il est lu. */
async function takeChallenge(c: Context) {
  const id = getCookie(c, CHALLENGE_COOKIE)
  deleteCookie(c, CHALLENGE_COOKIE, cookieOpts)
  if (!id) return null
  const [row] = await sql<{ challenge: string }[]>`delete from challenges where id = ${id} and expires_at > now() returning challenge`
  return row?.challenge ?? null
}

function setupCodeOk(code: unknown) {
  if (!config.setupCode || typeof code !== 'string') return false
  const a = Buffer.from(code)
  const b = Buffer.from(config.setupCode)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Freine les essais de code d'installation (mémoire du process, suffisant pour un seul utilisateur). */
const attempts = new Map<string, { count: number; until: number }>()
function throttled(ip: string) {
  const a = attempts.get(ip)
  return !!a && a.count >= 5 && a.until > Date.now()
}
function recordFailure(ip: string) {
  const a = attempts.get(ip) ?? { count: 0, until: 0 }
  attempts.set(ip, { count: a.count + 1, until: Date.now() + 15 * 60_000 })
}
const clientIp = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'

export const authRoutes = new Hono()

authRoutes.get('/status', async (c) => {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from credentials`
  return c.json({ authenticated: await isAuthenticated(c), hasCredentials: count > 0, setupConfigured: !!config.setupCode })
})

authRoutes.post('/register/options', async (c) => {
  const authed = await isAuthenticated(c)
  if (!authed) {
    const ip = clientIp(c)
    if (throttled(ip)) return c.json({ error: 'Trop d’essais, réessaie dans 15 minutes.' }, 429)
    const body = await c.req.json().catch(() => ({}))
    if (!setupCodeOk((body as { setupCode?: unknown }).setupCode)) {
      recordFailure(ip)
      return c.json({ error: config.setupCode ? 'Code d’installation incorrect.' : 'SETUP_CODE n’est pas configuré sur le serveur.' }, 403)
    }
  }
  const existing = await sql<{ id: string; transports: string[] }[]>`select id, transports from credentials`
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: 'coach',
    userDisplayName: 'Coach COROS',
    userID: USER_ID,
    attestationType: 'none',
    excludeCredentials: existing.map((x) => ({ id: x.id, transports: x.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
  await saveChallenge(c, options.challenge)
  return c.json(options)
})

authRoutes.post('/register/verify', async (c) => {
  const challenge = await takeChallenge(c)
  if (!challenge) return c.json({ error: 'Challenge expiré, recommence.' }, 400)
  const { response, name } = await c.req.json<{ response: RegistrationResponseJSON; name?: string }>()
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    })
    if (!result.verified) return c.json({ error: 'Passkey refusé.' }, 400)
    const { credential } = result.registrationInfo
    await sql`
      insert into credentials (id, public_key, counter, transports, name)
      values (${credential.id}, ${Buffer.from(credential.publicKey)}, ${credential.counter}, ${credential.transports ?? []}, ${name ?? null})`
    await startSession(c)
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Vérification impossible.' }, 400)
  }
})

authRoutes.post('/login/options', async (c) => {
  // Passkeys découvrables : pas de liste, l'iPhone propose le bon.
  const options = await generateAuthenticationOptions({ rpID: config.rpID, userVerification: 'required' })
  await saveChallenge(c, options.challenge)
  return c.json(options)
})

authRoutes.post('/login/verify', async (c) => {
  const challenge = await takeChallenge(c)
  if (!challenge) return c.json({ error: 'Challenge expiré, recommence.' }, 400)
  const response = await c.req.json<AuthenticationResponseJSON>()
  const [cred] = await sql<{ id: string; public_key: Buffer; counter: string; transports: string[] }[]>`
    select id, public_key, counter, transports from credentials where id = ${response.id}`
  if (!cred) return c.json({ error: 'Passkey inconnu sur ce serveur.' }, 400)
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      credential: { id: cred.id, publicKey: new Uint8Array(cred.public_key), counter: Number(cred.counter), transports: cred.transports },
      requireUserVerification: true,
    })
    if (!result.verified) return c.json({ error: 'Authentification refusée.' }, 400)
    await sql`update credentials set counter = ${result.authenticationInfo.newCounter}, last_used_at = now() where id = ${cred.id}`
    await startSession(c)
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Vérification impossible.' }, 400)
  }
})

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await sql`delete from sessions where token_hash = ${hash(token)}`
  deleteCookie(c, SESSION_COOKIE, cookieOpts)
  return c.json({ ok: true })
})

authRoutes.get('/credentials', requireAuth, async (c) => {
  const rows = await sql`select id, name, created_at, last_used_at from credentials order by created_at`
  return c.json(rows)
})
