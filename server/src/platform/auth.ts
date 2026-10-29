import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from '../config.js'
import { audit, db, getSetting, type UserRole, type UserStatus } from './db.js'
import { sendEmailLater } from './email.js'
import * as emails from './emails/templates.js'
import { createPlanFromSession } from './onboarding.js'

/**
 * Comptes de la plateforme : e-mail + mot de passe (scrypt), session en cookie httpOnly.
 * Distinct du passkey du coach personnel (`/api/auth`), qui garde son propre cookie.
 */
const SESSION_COOKIE = 'psid'
const SESSION_DAYS = 30
const cookieOpts = { httpOnly: true, secure: config.production, sameSite: 'Lax' as const, path: '/' }

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

export type SessionUser = { id: string; email: string; name: string; role: UserRole; status: UserStatus }

export async function currentUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  const [user] = await db<SessionUser[]>`
    select u.id, u.email, u.name, u.role, u.status
    from user_sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()`
  if (!user) return null
  // Seuls les e-mails d'ADMIN_EMAILS sont administrateurs, même si un rôle admin traîne en base.
  if (user.role === 'admin' && !config.adminEmails.includes(user.email.toLowerCase())) user.role = 'runner'
  return user
}

type Env = { Variables: { user: SessionUser } }

export const requireUser: MiddlewareHandler<Env> = async (c, next) => {
  const user = await currentUser(c)
  if (!user || user.status !== 'active') return c.json({ error: 'Not logged in' }, 401)
  c.set('user', user)
  await next()
}

export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  const user = await currentUser(c)
  if (!user || user.status !== 'active') return c.json({ error: 'Not logged in' }, 401)
  // Le back office est réservé aux e-mails d'ADMIN_EMAILS, quel que soit le rôle en base.
  if (user.role !== 'admin' || !config.adminEmails.includes(user.email.toLowerCase())) return c.json({ error: 'Admins only' }, 403)
  c.set('user', user)
  await next()
}

async function startSession(c: Context, userId: string) {
  const token = randomBytes(32).toString('base64url')
  await db`insert into user_sessions (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, now() + ${`${SESSION_DAYS} days`}::interval)`
  setCookie(c, SESSION_COOKIE, token, { ...cookieOpts, maxAge: SESSION_DAYS * 86400 })
}

/** Freine les essais de mot de passe par adresse IP (mémoire du process). */
const failures = new Map<string, { count: number; until: number }>()
const clientIp = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
function throttled(ip: string) {
  const f = failures.get(ip)
  return !!f && f.count >= 10 && f.until > Date.now()
}
function recordFailure(ip: string) {
  const f = failures.get(ip) ?? { count: 0, until: 0 }
  failures.set(ip, { count: f.until > Date.now() ? f.count + 1 : 1, until: Date.now() + 15 * 60_000 })
}

const SignupBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  productUpdates: z.boolean().optional(),
  source: z.string().trim().max(60).optional(),
  onboardingSessionId: z.string().uuid().optional(),
})

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
})

export const platformAuthRoutes = new Hono()

platformAuthRoutes.get('/me', async (c) => {
  const user = await currentUser(c)
  return c.json({ user })
})

platformAuthRoutes.post('/signup', async (c) => {
  const parsed = SignupBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Check your name, email and password (at least 8 characters).' }, 400)
  const body = parsed.data

  const isAdmin = config.adminEmails.includes(body.email)
  const mode = await getSetting<'open' | 'waitlist' | 'closed'>('signup_mode', 'open')
  if (mode === 'closed' && !isAdmin) return c.json({ error: 'Sign-ups are closed for now.' }, 403)
  const status: UserStatus = isAdmin || mode === 'open' ? 'active' : 'waitlist'

  const [existing] = await db`select 1 from users where email = ${body.email}`
  if (existing) return c.json({ error: 'An account already exists with this email. Log in instead.' }, 409)

  let variant: string | null = null
  if (body.onboardingSessionId) {
    const [s] = await db<{ variant_id: string }[]>`select variant_id from onboarding_sessions where id = ${body.onboardingSessionId}`
    variant = s?.variant_id ?? null
  }

  const [user] = await db<{ id: string }[]>`
    insert into users (email, name, password_hash, role, status, product_updates, source, onboarding_variant)
    values (${body.email}, ${body.name}, ${await hashPassword(body.password)}, ${isAdmin ? 'admin' : 'runner'}, ${status},
            ${body.productUpdates ?? false}, ${body.source || 'direct'}, ${variant})
    returning id`
  if (body.onboardingSessionId) {
    const linked = await db`update onboarding_sessions set user_id = ${user.id} where id = ${body.onboardingSessionId} and user_id is null and not is_preview returning id`
    if (linked.length) {
      await createPlanFromSession(body.onboardingSessionId, user.id)
      await db`update wearable_connections set user_id = ${user.id} where onboarding_session_id = ${body.onboardingSessionId} and user_id is null`
    }
  }
  // Le lead capté pendant l'onboarding est rattaché au compte.
  await db`update leads set user_id = ${user.id}, updated_at = now() where email = ${body.email} and user_id is null`
  await audit(user.id, 'user.signup', body.email, { status, source: body.source ?? 'direct' })

  if (status === 'active') {
    await db`update users set last_login_at = now() where id = ${user.id}`
    await startSession(c, user.id)
    sendEmailLater(body.email, 'welcome', emails.welcome({ name: body.name, app: config.origin }))
  } else {
    sendEmailLater(body.email, 'waitlist', emails.waitlist({ name: body.name }))
  }
  return c.json({ status })
})

platformAuthRoutes.post('/login', async (c) => {
  const ip = clientIp(c)
  if (throttled(ip)) return c.json({ error: 'Too many attempts, try again in 15 minutes.' }, 429)
  const parsed = LoginBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Incorrect email or password.' }, 400)
  const { email, password } = parsed.data

  const [user] = await db<{ id: string; password_hash: string; status: UserStatus; role: UserRole }[]>`
    select id, password_hash, status, role from users where email = ${email}`
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordFailure(ip)
    return c.json({ error: 'Incorrect email or password.' }, 401)
  }
  if (config.adminEmails.includes(email) && (user.role !== 'admin' || user.status !== 'active')) {
    await db`update users set role = 'admin', status = 'active' where id = ${user.id}`
    user.status = 'active'
  } else if (!config.adminEmails.includes(email) && user.role === 'admin') {
    await db`update users set role = 'runner' where id = ${user.id}`
  }
  if (user.status === 'waitlist') return c.json({ error: 'Your account is on the waitlist: we’ll let you know as soon as it’s open.' }, 403)
  if (user.status === 'suspended') return c.json({ error: 'This account is suspended.' }, 403)

  await db`update users set last_login_at = now() where id = ${user.id}`
  await startSession(c, user.id)
  return c.json({ ok: true })
})

platformAuthRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await db`delete from user_sessions where token_hash = ${hashToken(token)}`
  deleteCookie(c, SESSION_COOKIE, cookieOpts)
  return c.json({ ok: true })
})

// ---------- Mot de passe oublié ----------

const RESET_MINUTES = 60

/** Répond toujours pareil, que l'adresse existe ou non : on ne révèle pas qui a un compte. */
platformAuthRoutes.post('/forgot', async (c) => {
  const ip = clientIp(c)
  if (throttled(ip)) return c.json({ error: 'Too many attempts, try again in 15 minutes.' }, 429)
  recordFailure(ip)
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid email address.' }, 400)
  const [user] = await db<{ id: string; name: string; status: UserStatus }[]>`select id, name, status from users where email = ${parsed.data.email}`
  if (user && user.status !== 'suspended') {
    const token = randomBytes(32).toString('base64url')
    await db`
      insert into password_resets (token_hash, user_id, expires_at)
      values (${hashToken(token)}, ${user.id}, now() + ${`${RESET_MINUTES} minutes`}::interval)`
    const url = `${config.origin}/reset-password?token=${token}`
    sendEmailLater(parsed.data.email, 'password-reset', emails.passwordReset({ name: user.name, url, minutes: RESET_MINUTES }))
  }
  return c.json({ ok: true })
})

platformAuthRoutes.post('/reset', async (c) => {
  const parsed = z.object({ token: z.string().min(20), password: z.string().min(8).max(200) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Password too short (at least 8 characters).' }, 400)
  const [reset] = await db<{ user_id: string }[]>`
    update password_resets set used_at = now()
    where token_hash = ${hashToken(parsed.data.token)} and used_at is null and expires_at > now()
    returning user_id`
  if (!reset) return c.json({ error: 'This link has expired or has already been used. Request a new one.' }, 400)
  const [user] = await db<{ email: string; status: UserStatus }[]>`
    update users set password_hash = ${await hashPassword(parsed.data.password)} where id = ${reset.user_id} returning email, status`
  // Toutes les autres sessions tombent : le mot de passe a changé.
  await db`delete from user_sessions where user_id = ${reset.user_id}`
  await audit(reset.user_id, 'user.password_reset', user.email)
  if (user.status === 'active') {
    await db`update users set last_login_at = now() where id = ${reset.user_id}`
    await startSession(c, reset.user_id)
  }
  return c.json({ ok: true, status: user.status })
})
