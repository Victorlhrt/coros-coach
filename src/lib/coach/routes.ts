/** Adresses du coach dans l'espace coureur (app.raice.run/account). */
export const ROUTES = {
  today: '/account/home',
  plan: '/account/plan',
  history: '/account/analytics',
  adjust: '/account/coach',
  settings: '/account/settings',
  goal: '/account/goal',
  debug: '/account/debug',
  session: (id: string) => `/account/session/${id}`,
}

/** Ancienne adresse du coach personnel (/app/#/…) vers sa place dans l'espace coureur. */
export function legacyCoachPath(hash: string) {
  const path = hash.replace(/^#/, '') || '/'
  const session = path.match(/^\/seance\/([^/?#]+)/)
  if (session) return ROUTES.session(session[1])
  const map: Record<string, string> = { '/': ROUTES.today, '/plan': ROUTES.plan, '/historique': ROUTES.history, '/reglages': ROUTES.settings, '/objectif': ROUTES.goal, '/ajuster': ROUTES.adjust, '/debug': ROUTES.debug }
  return map[path.split('?')[0]] ?? ROUTES.today
}
