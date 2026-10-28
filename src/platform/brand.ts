/** Identité de la plateforme. */
export const BRAND = {
  name: 'Raice.run',
  tagline: 'Your race plan, written by AI, synced to your watch.',
}

/**
 * En production, la landing (raice.run) et l'application (app.raice.run) sont deux services distincts :
 * les liens entre les deux sont absolus. Ailleurs (local, domaine Railway), tout est sur la même origine.
 */
const SITE_HOST = 'raice.run'
const host = typeof window === 'undefined' ? '' : window.location.hostname
const onSite = host === SITE_HOST || host === `www.${SITE_HOST}`
const onApp = host === `app.${SITE_HOST}`

/** Lien vers une page de l'application (connexion, onboarding, back office…). */
export const appHref = (path: string) => (onSite ? `https://app.${SITE_HOST}${path}` : path)

/** Lien vers la landing. */
export const siteHref = (path = '/') => (onApp ? `https://${SITE_HOST}${path}` : path)
