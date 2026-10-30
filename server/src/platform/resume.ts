import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Context } from 'hono'
import { config } from '../config.js'
import { db } from './db.js'

/**
 * Liens signés envoyés par e-mail : reprise d'un onboarding abandonné et désinscription des relances.
 * Jeton = base64url(charge JSON) + "." + base64url(HMAC-SHA256), sans état côté serveur.
 */

const secret = (() => {
  if (config.resumeTokenSecret) return config.resumeTokenSecret
  console.warn('[liens signés] RESUME_TOKEN_SECRET absente : clé dérivée de DATABASE_URL (à définir en production).')
  return createHash('sha256').update(`raice-resume:${config.databaseUrl}`).digest('hex')
})()

type Purpose = 'resume' | 'unsub'
type Payload = { p: Purpose; id: string; exp: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const mac = (data: string) => createHmac('sha256', secret).update(data).digest()

function sign(p: Purpose, id: string, ttlDays: number) {
  const body = b64(JSON.stringify({ p, id, exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 } satisfies Payload))
  return `${body}.${b64(mac(body))}`
}

/** Identifiant porté par le jeton, `expired` si la signature est bonne mais la date passée, sinon null. */
function verify(p: Purpose, token: string | undefined): string | 'expired' | null {
  if (!token || token.length > 500) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = mac(body)
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload
    if (data.p !== p || typeof data.id !== 'string') return null
    return data.exp * 1000 < Date.now() ? 'expired' : data.id
  } catch {
    return null
  }
}

export const RESUME_TTL_DAYS = 14
export const resumeToken = (sessionId: string) => sign('resume', sessionId, RESUME_TTL_DAYS)
export const unsubscribeToken = (leadId: string) => sign('unsub', leadId, 365)
export const verifyUnsubscribeToken = (token: string | undefined) => verify('unsub', token)

/**
 * Ordre des étapes du parcours Complet, recopié de STEPS dans src/platform/onboarding/CompleteOnboarding.tsx
 * (à tenir à jour) avec les mêmes conditions d'affichage : sert à nommer l'étape où la personne s'est arrêtée.
 */
const FLOW: { id: string; shown?: (a: Record<string, unknown>) => boolean }[] = [
  { id: 'identity' },
  { id: 'reason' },
  { id: 'watch' },
  { id: 'wearables', shown: (a) => a.has_watch === 'yes' },
  {
    id: 'connect',
    shown: (a) => a.has_watch === 'yes' && Array.isArray(a.wearables) && a.wearables.some((w) => w === 'coros' || w === 'garmin'),
  },
  { id: 'nowatch', shown: (a) => a.has_watch === 'no' },
  { id: 'strava', shown: (a) => a.has_watch === 'no' && a.data_source === 'strava' },
  { id: 'profile' },
  { id: 'about' },
  { id: 'experience' },
  { id: 'goal' },
  { id: 'target', shown: (a) => (a.goal as { type?: string } | undefined)?.type !== 'train' },
  { id: 'estimate' },
  { id: 'volume' },
  { id: 'pains' },
  { id: 'events' },
  { id: 'days' },
  { id: 'duration' },
  { id: 'gear' },
  { id: 'generate' },
]

/** Étape suivant la dernière validée (celle où la personne s'est arrêtée), ou null si inconnue. */
export function nextStepId(lastStepId: string | null, answers: Record<string, unknown>): string | null {
  if (!lastStepId) return null
  const flow = FLOW.filter((s) => !s.shown || s.shown(answers))
  const i = flow.findIndex((s) => s.id === lastStepId)
  return i >= 0 && i + 1 < flow.length ? flow[i + 1].id : null
}

// Limite légère par adresse IP : le jeton est déjà impossible à deviner, on évite seulement le martèlement.
const hits = new Map<string, number[]>()
export function limited(key: string, max = 30, windowMs = 10 * 60_000) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
  return recent.length > max
}
export const clientIp = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local'

/**
 * GET /api/platform/onboarding/resume?token= : reprise d'un parcours depuis le lien de l'e-mail de relance.
 * `stepId` = dernière étape validée, `nextStepId` = celle où reprendre, `stepReached` = index atteint dans le fil.
 */
export async function resumeHandler(c: Context) {
  if (limited(`resume:${clientIp(c)}`)) return c.json({ error: 'Too many attempts, try again in a few minutes.' }, 429)
  const id = verify('resume', c.req.query('token'))
  if (id === 'expired') return c.json({ error: 'This link has expired. Start the onboarding again.', code: 'expired' }, 410)
  if (!id) return c.json({ error: 'Onboarding not found', code: 'not_found' }, 404)
  return resumeSession(c, id)
}

/**
 * GET /api/platform/onboarding/sessions/:id/resume : reprise après un rechargement de la page (onglet rechargé au retour
 * de Garmin Connect sur mobile…). L'identifiant du parcours, gardé par le navigateur, suffit comme pour PATCH /sessions/:id.
 */
export async function resumeByIdHandler(c: Context) {
  if (limited(`resume:${clientIp(c)}`)) return c.json({ error: 'Too many attempts, try again in a few minutes.' }, 429)
  const id = c.req.param('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Onboarding not found', code: 'not_found' }, 404)
  return resumeSession(c, id)
}

async function resumeSession(c: Context, id: string) {
  const [s] = await db<
    { id: string; variant_id: string; answers: Record<string, unknown>; step_reached: number; last_step_id: string | null; lead_step: string | null; invite_code: string | null }[]
  >`
    select s.id, s.variant_id, s.answers, s.step_reached, s.last_step_id, s.invite_code,
           (select l.last_step from leads l where l.onboarding_session_id = s.id limit 1) lead_step
    from onboarding_sessions s
    where s.id = ${id} and s.completed_at is null and not s.is_preview`
  if (!s) return c.json({ error: 'Onboarding not found or already finished', code: 'not_found' }, 404)
  const stepId = s.last_step_id ?? s.lead_step
  return c.json({
    sessionId: s.id,
    variantId: s.variant_id,
    answers: s.answers,
    stepId,
    nextStepId: nextStepId(stepId, s.answers),
    stepReached: s.step_reached,
    inviteCode: s.invite_code,
  })
}
