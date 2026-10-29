import { useQuery } from '@tanstack/react-query'
import type { Activity } from '@/lib/coros/activities'
import { ApiError, api } from '@/platform/api'
import type { StravaRun, StravaSummary } from '@/platform/onboarding/strava'

/**
 * Sorties importées depuis l'archive Strava du coureur (gardées par le serveur, deux ans au plus).
 * Hors session plateforme (coach perso), simplement aucune.
 */

export type ImportedActivity = Activity & { startMs?: number | null }
export type StravaImportStatus = { importedAt: string | null; runs: number; first: string | null; last: string | null; summary: StravaSummary | null }

export const IMPORTED_KEY = ['strava', 'imported'] as const
export const STRAVA_STATUS_KEY = ['strava', 'status'] as const
/** Mêmes bornes que le serveur (server/src/platform/strava-import.ts). */
const MAX_DAYS = 730
const MAX_RUNS = 1000

const none = (e: unknown): ImportedActivity[] | Promise<never> => (e instanceof ApiError && e.status === 401 ? [] : Promise.reject(e))

export function useImportedActivities(days: number) {
  return useQuery({
    queryKey: [...IMPORTED_KEY, days],
    queryFn: () => fetchImportedActivities(days),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

export function fetchImportedActivities(days: number) {
  return api<ImportedActivity[]>(`/account/imported-activities?days=${days}`).catch(none)
}

export function useStravaImportStatus() {
  return useQuery({
    queryKey: STRAVA_STATUS_KEY,
    queryFn: () => api<StravaImportStatus>('/account/strava-import').catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

/** Des sorties Strava importées sont gardées pour ce compte (elles comptent alors comme celles d'une montre). */
export function useHasImportedRuns() {
  return (useStravaImportStatus().data?.runs ?? 0) > 0
}

/** Envoie le résumé et les sorties des deux dernières années (les plus récentes, 1 000 au plus, noms raccourcis). */
export function uploadStravaImport(summary: StravaSummary, runs: StravaRun[]) {
  const from = Date.now() - MAX_DAYS * 86_400_000
  const recent = runs
    .filter((r) => r.startMs >= from)
    .slice(-MAX_RUNS)
    .map((r) => ({ ...r, name: r.name.slice(0, 60) }))
  return api<{ importedAt: string; runs: number; summarySaved: boolean }>('/account/strava-import', { method: 'PUT', body: { summary, runs: recent } })
}

export function deleteStravaImport() {
  return api<{ ok: true }>('/account/strava-import', { method: 'DELETE' })
}
