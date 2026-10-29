import { useQuery } from '@tanstack/react-query'
import { fetchGarminActivities, useGarminConnected } from '@/lib/garmin/client'
import { mergeActivities } from '@/lib/garmin/merge'
import { fetchImportedActivities, useHasImportedRuns } from '@/lib/strava/imported'
import { normalizeActivities } from './activities'
import { useCorosAuth } from './auth-store'
import { fetchRunRecords } from './data'

/**
 * Sorties COROS et Garmin réunies (doublons retirés), puis les sorties importées de l'archive Strava
 * (gardées seulement quand aucune montre n'a la même sortie : même jour, distance à 2 % près).
 * Une source en échec n'empêche pas les autres ; si toutes échouent, l'erreur remonte.
 */
async function loadActivities(days: number, coros: boolean, garmin: boolean, imported = false) {
  const [c, g, s] = await Promise.allSettled([
    coros ? fetchRunRecords(days) : Promise.resolve(null),
    garmin ? fetchGarminActivities(days) : Promise.resolve([]),
    imported ? fetchImportedActivities(days) : Promise.resolve([]),
  ])
  const failed = [coros && c, garmin && g, imported && s].filter((r) => r && r.status === 'rejected') as PromiseRejectedResult[]
  if (failed.length && failed.length === [coros, garmin, imported].filter(Boolean).length) throw failed[0].reason
  const raw = c.status === 'fulfilled' ? c.value : null
  const watch = mergeActivities(coros && raw ? normalizeActivities(raw) : [], g.status === 'fulfilled' ? g.value : [])
  const activities = mergeActivities(watch, s.status === 'fulfilled' ? s.value : [])
  return { raw, activities }
}

/** Activités course des 6 dernières semaines, rechargées à l'ouverture et au pull-to-refresh. */
export function useActivities() {
  const coros = useCorosAuth((s) => s.connected)
  const garmin = useGarminConnected()
  const imported = useHasImportedRuns()
  return useQuery({
    queryKey: ['coros', 'activities', 42, coros, garmin, imported],
    queryFn: () => loadActivities(42, coros, garmin, imported),
    enabled: coros || garmin || imported,
    staleTime: 5 * 60 * 1000,
  })
}

/** 16 semaines d'activités (Analytics › Runs et Fitness) : plus long que l'accueil, pour l'historique et la forme. */
export function useActivityHistory() {
  const coros = useCorosAuth((s) => s.connected)
  const garmin = useGarminConnected()
  const imported = useHasImportedRuns()
  return useQuery({
    queryKey: ['coros', 'activities', 112, coros, garmin, imported],
    queryFn: async () => (await loadActivities(112, coros, garmin, imported)).activities,
    enabled: coros || garmin || imported,
    staleTime: 10 * 60 * 1000,
  })
}
