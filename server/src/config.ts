/** Configuration lue dans les variables d'environnement (Railway en prod, .env.local / shell en dev). */

function required(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}

const production = process.env.NODE_ENV === 'production'

/** Origine publique de l'app : PUBLIC_ORIGIN, sinon le domaine Railway, sinon le serveur Vite en dev. */
const origin =
  process.env.PUBLIC_ORIGIN ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173')

export const config = {
  production,
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: required('DATABASE_URL'),
  /** Base de la plateforme (comptes, onboardings, plans). Par défaut la même que le coach, pratique en local. */
  platformDatabaseUrl: process.env.PLATFORM_DATABASE_URL ?? required('DATABASE_URL'),
  /** E-mails promus administrateurs à l'inscription ou à la connexion (séparés par des virgules). */
  /** Envoi d'e-mails par Resend (sans clé, les e-mails sont seulement journalisés). */
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'Raice.run <bonjour@raice.run>',
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? '',
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  /** Compte de la plateforme qui reprend l'état du coach personnel (plan, séances, réglages) à sa première ouverture. */
  coachOwnerEmail: (process.env.COACH_OWNER_EMAIL ?? 'lhermetvictor@gmail.com').trim().toLowerCase(),
  /** Code demandé pour enregistrer un passkey sans être connecté (premier appareil, appareil sans passkey synchronisé). */
  setupCode: process.env.SETUP_CODE ?? '',
  origin,
  rpID: new URL(origin).hostname,
  rpName: 'Coach COROS',
}
