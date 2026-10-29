import { useQuery } from '@tanstack/react-query'
import { normalizeActivities } from './activities'
import { useCorosAuth } from './auth-store'
import { fetchRunRecords } from './data'

/** Activités course des 6 dernières semaines, rechargées à l'ouverture et au pull-to-refresh. */
export function useActivities() {
  const connected = useCorosAuth((s) => s.connected)
  return useQuery({
    queryKey: ['coros', 'activities'],
    queryFn: async () => {
      const raw = await fetchRunRecords(42)
      return { raw, activities: normalizeActivities(raw) }
    },
    enabled: connected,
    staleTime: 5 * 60 * 1000,
  })
}

/** 16 semaines d'activités (Analytics › Runs et Fitness) : plus long que l'accueil, pour l'historique et la forme. */
export function useActivityHistory() {
  const connected = useCorosAuth((s) => s.connected)
  return useQuery({
    queryKey: ['coros', 'activities', 112],
    queryFn: async () => normalizeActivities(await fetchRunRecords(112)),
    enabled: connected,
    staleTime: 10 * 60 * 1000,
  })
}
