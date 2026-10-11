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
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  /** Code demandé pour enregistrer un passkey sans être connecté (premier appareil, appareil sans passkey synchronisé). */
  setupCode: process.env.SETUP_CODE ?? '',
  origin,
  rpID: new URL(origin).hostname,
  rpName: 'Coach COROS',
}
