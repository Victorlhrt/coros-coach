import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from '../config.js'
import { audit, db, getSetting, type UserRole, type UserStatus } from './db.js'
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
  return user ?? null
}

type Env = { Variables: { user: SessionUser } }

export const requireUser: MiddlewareHandler<Env> = async (c, next) => {
  const user = await currentUser(c)
  if (!user || user.status !== 'active') return c.json({ error: 'Non connecté' }, 401)
  c.set('user', user)
  await next()
}

export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  const user = await currentUser(c)
  if (!user || user.status !== 'active') return c.json({ error: 'Non connecté' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Réservé aux administrateurs' }, 403)
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
  if (!parsed.success) return c.json({ error: 'Vérifie le nom, l’e-mail et le mot de passe (8 caractères minimum).' }, 400)
  const body = parsed.data

  const isAdmin = config.adminEmails.includes(body.email)
  const mode = await getSetting<'open' | 'waitlist' | 'closed'>('signup_mode', 'open')
  if (mode === 'closed' && !isAdmin) return c.json({ error: 'Les inscriptions sont fermées pour le moment.' }, 403)
  const status: UserStatus = isAdmin || mode === 'open' ? 'active' : 'waitlist'

  const [existing] = await db`select 1 from users where email = ${body.email}`
  if (existing) return c.json({ error: 'Un compte existe déjà avec cet e-mail. Connecte-toi.' }, 409)

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
    if (linked.length) await createPlanFromSession(body.onboardingSessionId, user.id)
  }
  await audit(user.id, 'user.signup', body.email, { status, source: body.source ?? 'direct' })

  if (status === 'active') {
    await db`update users set last_login_at = now() where id = ${user.id}`
    await startSession(c, user.id)
  }
  return c.json({ status })
})

platformAuthRoutes.post('/login', async (c) => {
  const ip = clientIp(c)
  if (throttled(ip)) return c.json({ error: 'Trop d’essais, réessaie dans 15 minutes.' }, 429)
  const parsed = LoginBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'E-mail ou mot de passe incorrect.' }, 400)
  const { email, password } = parsed.data

  const [user] = await db<{ id: string; password_hash: string; status: UserStatus; role: UserRole }[]>`
    select id, password_hash, status, role from users where email = ${email}`
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordFailure(ip)
    return c.json({ error: 'E-mail ou mot de passe incorrect.' }, 401)
  }
  if (config.adminEmails.includes(email) && (user.role !== 'admin' || user.status !== 'active')) {
    await db`update users set role = 'admin', status = 'active' where id = ${user.id}`
    user.status = 'active'
  }
  if (user.status === 'waitlist') return c.json({ error: 'Ton compte est sur liste d’attente : on te prévient dès qu’il est ouvert.' }, 403)
  if (user.status === 'suspended') return c.json({ error: 'Ce compte est suspendu.' }, 403)

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
