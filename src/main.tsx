import './components/arc/foundation.css'
import './index.css'
import { legacyCoachPath } from './lib/coach/routes'

/** Plateforme : site public, connexion, onboarding, espace coureur (avec le coach) et back office. */
const root = document.getElementById('root')!
const path = window.location.pathname

// Le coach personnel (/app/#/…) vit désormais dans l'espace coureur : on redirige vers la même page.
if (path === '/app' || path.startsWith('/app/')) {
  window.history.replaceState(null, '', legacyCoachPath(window.location.hash))
}
document.documentElement.dataset.surface = 'platform'
void import('./platform/main').then((m) => m.mountPlatform(root))
