import { Hono } from 'hono'
import { config } from '../config.js'
import { db, getSetting } from './db.js'
import { sendEmail } from './email.js'
import { onboardingReminder } from './emails/templates.js'
import { clientIp, limited, nextStepId, resumeToken, unsubscribeToken, verifyUnsubscribeToken } from './resume.js'

/**
 * Relance des onboardings abandonnés : un seul e-mail par lead, 3 h après la dernière activité du parcours
 * (et jusqu'à 7 jours après, au-delà on n'écrit plus). Exclus : aperçus, parcours terminés, coureurs déjà
 * onboardés, désinscrits. Le job tourne toutes les 10 min ; un verrou consultatif Postgres garantit
 * qu'une seule instance l'exécute à la fois, et `reminder_sent_at` est posé avant l'envoi (jamais deux fois).
 */

/** Réglage du back office (app_settings), actif par défaut. */
export const REMINDERS_SETTING = 'onboarding_reminders'
const LOCK_KEY = 72_410_031 // clé arbitraire du verrou consultatif, propre à ce job

type Due = { id: string; email: string; first_name: string; session_id: string; answers: Record<string, unknown>; last_step_id: string | null; last_step: string | null }

export async function runOnboardingReminders(): Promise<{ sent: number; skipped?: string }> {
  if ((await getSetting<boolean>(REMINDERS_SETTING, true)) === false) return { sent: 0, skipped: 'disabled' }
  const since = await getSetting<string>('onboarding_reminders_since', new Date(0).toISOString())
  const conn = await db.reserve()
  try {
    const [lock] = await conn<{ ok: boolean }[]>`select pg_try_advisory_lock(${LOCK_KEY}) ok`
    if (!lock?.ok) return { sent: 0, skipped: 'locked' }
    try {
      const due = await conn<Due[]>`
        select l.id, l.email, l.first_name, s.id session_id, s.answers, s.last_step_id, l.last_step
        from leads l
        join onboarding_sessions s on s.id = l.onboarding_session_id
        where l.reminder_sent_at is null and l.unsubscribed_at is null and l.completed_at is null
          and s.completed_at is null and not s.is_preview
          and s.updated_at < now() - interval '3 hours' and s.updated_at > now() - interval '7 days'
          and s.updated_at > ${since}::timestamptz
          and not exists (
            select 1 from users u
            join onboarding_sessions d on d.user_id = u.id and d.completed_at is not null and not d.is_preview
            where u.id = l.user_id or u.email = l.email)
        order by s.updated_at
        limit 50`
      let sent = 0
      for (const lead of due) {
        // Réservation atomique avant l'envoi : au pire une relance perdue, jamais deux.
        const [claimed] = await conn`update leads set reminder_sent_at = now() where id = ${lead.id} and reminder_sent_at is null returning id`
        if (!claimed) continue
        const stepId = lead.last_step_id ?? lead.last_step
        const email = onboardingReminder({
          firstName: lead.first_name,
          resumeUrl: `${config.origin}/onboarding?resume=${resumeToken(lead.session_id)}`,
          unsubscribeUrl: `${config.origin}/api/platform/emails/unsubscribe?token=${unsubscribeToken(lead.id)}`,
          stepId: nextStepId(stepId, lead.answers),
        })
        await sendEmail(lead.email, 'onboarding-reminder', email)
        sent++
      }
      if (sent) console.log(`[relances onboarding] ${sent} e-mail(s) envoyé(s)`)
      return { sent }
    } finally {
      await conn`select pg_advisory_unlock(${LOCK_KEY})`
    }
  } finally {
    conn.release()
  }
}

/** Démarré au lancement de l'app : premier passage après 1 min, puis toutes les `REMINDER_INTERVAL_MS`. */
export function startOnboardingReminders() {
  const tick = () => runOnboardingReminders().catch((e) => console.error('[relances onboarding] échec', e))
  setTimeout(tick, Math.min(60_000, config.reminderIntervalMs)).unref()
  setInterval(tick, config.reminderIntervalMs).unref()
}

// ---------- Désinscription : /api/platform/emails ----------

export const emailRoutes = new Hono()

const page = (title: string, text: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Raice.run</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#EDEDED;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;padding:16px;box-sizing:border-box;">
<main style="max-width:420px;background:#0B0B0B;border:1px solid #262626;border-radius:34px;padding:36px 32px;">
<div style="font-size:18px;font-weight:600;font-style:italic;letter-spacing:-0.03em;color:#fff;margin-bottom:24px;">Raice<span style="color:#8C8C8C;">.run</span></div>
<h1 style="margin:0 0 12px;font-size:24px;line-height:30px;font-weight:600;letter-spacing:-0.03em;color:#fff;">${title}</h1>
<p style="margin:0;font-size:15px;line-height:24px;color:#B4B4B4;">${text}</p>
</main></body></html>`

async function unsubscribe(token: string | undefined) {
  const id = verifyUnsubscribeToken(token)
  if (!id || id === 'expired') return false
  const [row] = await db`update leads set unsubscribed_at = coalesce(unsubscribed_at, now()), updated_at = now() where id = ${id} returning id`
  return !!row
}

emailRoutes.get('/unsubscribe', async (c) => {
  if (limited(`unsub:${clientIp(c)}`)) return c.html(page('Too many attempts', 'Try again in a few minutes.'), 429)
  return (await unsubscribe(c.req.query('token')))
    ? c.html(page('You’re unsubscribed', 'We won’t send you any more reminders. Your answers stay saved if you want to finish your plan later.'))
    : c.html(page('Link not valid', 'This unsubscribe link is invalid or has expired.'), 404)
})

// Désinscription en un clic des messageries (RFC 8058, en-tête List-Unsubscribe-Post).
emailRoutes.post('/unsubscribe', async (c) => {
  if (limited(`unsub:${clientIp(c)}`)) return c.json({ error: 'Too many attempts' }, 429)
  return (await unsubscribe(c.req.query('token'))) ? c.json({ ok: true }) : c.json({ error: 'Invalid link' }, 404)
})
