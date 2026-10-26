import { config } from '../config.js'
import { db } from './db.js'
import type { Email } from './emails/layout.js'

/**
 * Envoi par l'API Resend. Chaque envoi est journalisé (table email_log) ; sans RESEND_API_KEY,
 * l'e-mail est seulement journalisé avec le statut « skipped ». Un échec d'envoi ne casse jamais la requête.
 */
export async function sendEmail(to: string, template: string, email: Email): Promise<{ ok: boolean; error?: string }> {
  let status: 'sent' | 'failed' | 'skipped' = 'skipped'
  let providerId: string | null = null
  let error: string | null = null

  if (config.resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: config.emailFrom,
          to: [to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(config.emailReplyTo ? { reply_to: config.emailReplyTo } : {}),
          tags: [{ name: 'template', value: template.replace(/[^a-zA-Z0-9_-]/g, '_') }],
        }),
      })
      const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null
      if (res.ok) {
        status = 'sent'
        providerId = body?.id ?? null
      } else {
        status = 'failed'
        error = body?.message ?? `Resend ${res.status}`
      }
    } catch (e) {
      status = 'failed'
      error = e instanceof Error ? e.message : String(e)
    }
  } else {
    console.log(`[e-mail non envoyé, RESEND_API_KEY absente] ${template} → ${to} : ${email.subject}`)
  }

  await db`
    insert into email_log (recipient, template, subject, status, provider_id, error)
    values (${to}, ${template}, ${email.subject}, ${status}, ${providerId}, ${error})`.catch(() => {})
  if (status === 'failed') console.error(`[e-mail en échec] ${template} → ${to} : ${error}`)
  return status === 'failed' ? { ok: false, error: error ?? 'Échec' } : { ok: true }
}

/** Envoi sans attendre ni bloquer la réponse HTTP. */
export function sendEmailLater(to: string, template: string, email: Email) {
  void sendEmail(to, template, email)
}
