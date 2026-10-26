import './components/arc/foundation.css'
import './index.css'

/**
 * Deux applications dans un même build : le coach personnel sous /app/ (HashRouter)
 * et la plateforme (site public, connexion, onboarding, back office) partout ailleurs.
 * Chacune est chargée à la demande pour ne pas alourdir l'autre.
 */
const root = document.getElementById('root')!
const path = window.location.pathname

if (path === '/app' || path.startsWith('/app/')) {
  if (path === '/app') window.history.replaceState(null, '', `/app/${window.location.search}${window.location.hash}`)
  void import('./coach-main').then((m) => m.mountCoach(root))
} else {
  document.documentElement.dataset.surface = 'platform'
  void import('./platform/main').then((m) => m.mountPlatform(root))
}
