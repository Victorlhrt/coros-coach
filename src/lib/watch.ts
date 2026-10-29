import { useCorosAuth } from '@/lib/coros/auth-store'
import { useGarminConnected } from '@/lib/garmin/client'
import { useHasImportedRuns } from '@/lib/strava/imported'

/**
 * Une montre fournit les activités : COROS (tokens dans le coffre) ou Garmin (clé Personal API côté serveur).
 * Pour l'affichage des sorties seulement ; l'envoi des séances à la montre reste propre à COROS (`useCorosAuth`).
 */
export function useHasWatch() {
  const coros = useCorosAuth((s) => s.connected)
  const garmin = useGarminConnected()
  return coros || garmin
}

/** Des sorties à afficher : une montre connectée, ou des sorties importées de l'archive Strava. */
export function useHasRunData() {
  const watch = useHasWatch()
  const imported = useHasImportedRuns()
  return watch || imported
}
