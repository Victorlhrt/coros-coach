/** Adresses du coach dans l'espace coureur (app.raice.run/compte). */
export const ROUTES = {
  today: '/compte/home',
  plan: '/compte/plan',
  history: '/compte/analytics',
  adjust: '/compte/coach',
  settings: '/compte/settings',
  goal: '/compte/objectif',
  debug: '/compte/debug',
  session: (id: string) => `/compte/seance/${id}`,
}

/** Ancienne adresse du coach personnel (/app/#/…) vers sa place dans l'espace coureur. */
export function legacyCoachPath(hash: string) {
  const path = hash.replace(/^#/, '') || '/'
  const session = path.match(/^\/seance\/([^/?#]+)/)
  if (session) return ROUTES.session(session[1])
  const map: Record<string, string> = { '/': ROUTES.today, '/plan': ROUTES.plan, '/historique': ROUTES.history, '/reglages': ROUTES.settings, '/objectif': ROUTES.goal, '/ajuster': ROUTES.adjust, '/debug': ROUTES.debug }
  return map[path.split('?')[0]] ?? ROUTES.today
}
