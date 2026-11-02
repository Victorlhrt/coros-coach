import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { loadActivities } from '@/lib/coros/activity-hooks'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { fetchRecords } from '@/lib/coros/data'
import { useGarminConnected } from '@/lib/garmin/client'
import { useStravaImportStatus } from '@/lib/strava/imported'
import { usePlan } from '@/lib/store/plan'
import { recordsFromRuns } from './profile-from-runs'
import { fastestRecords, mergeRecords } from './records'

/**
 * Records 5 km à marathon tenus à jour sans bouton : COROS (recherche par distance sur 12 mois), Garmin et
 * l'archive Strava (sorties de la bonne distance), le meilleur temps de chaque distance l'emporte. Relu après un
 * import Strava ; les temps saisis à la main restent prioritaires.
 */
export function useAutoRecords() {
  const coros = useCorosAuth((s) => s.connected)
  const garmin = useGarminConnected()
  const strava = useStravaImportStatus().data
  const imported = (strava?.runs ?? 0) > 0
  const query = useQuery({
    queryKey: ['records', 'auto', coros, garmin, strava?.importedAt ?? null],
    queryFn: async () => {
      const [fromCoros, fromRuns] = await Promise.all([
        coros ? fetchRecords().catch(() => []) : Promise.resolve([]),
        garmin || imported ? loadActivities(366, false, garmin, imported).then((r) => recordsFromRuns(r.activities)).catch(() => []) : Promise.resolve([]),
      ])
      return fastestRecords(fromCoros, fromRuns)
    },
    enabled: coros || garmin || imported,
    staleTime: 6 * 60 * 60_000,
  })
  useEffect(() => {
    if (!query.data?.length) return
    const { records, setRecords } = usePlan.getState()
    const next = mergeRecords(records, query.data)
    if (JSON.stringify(next) !== JSON.stringify(records)) setRecords(next)
  }, [query.data])
  return query
}
