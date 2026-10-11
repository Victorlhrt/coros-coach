import { addDays, toCoros, today } from '@/lib/coach/dates'
import { corosRead } from './client'

const RUN_CODES = [100, 101, 102, 103]

/**
 * querySportRecords déclare tous ses filtres comme requis : on envoie d'abord des null,
 * puis des valeurs permissives si le serveur les refuse.
 */
export async function fetchRunRecords(days: number) {
  const base = { startDate: toCoros(addDays(today(), -days)), endDate: toCoros(today()), sportTypeCodes: RUN_CODES, limit: 100 }
  try {
    return await corosRead('querySportRecords', {
      ...base,
      minDistanceKm: null,
      maxDistanceKm: null,
      minDurationMinutes: null,
      maxDurationMinutes: null,
      maxAveragePace: null,
      locationKeyword: null,
    })
  } catch {
    return corosRead('querySportRecords', {
      ...base,
      minDistanceKm: 0,
      maxDistanceKm: 1000,
      minDurationMinutes: 0,
      maxDurationMinutes: 6000,
      maxAveragePace: '59:59',
      locationKeyword: '',
    })
  }
}

/** Lance plusieurs lectures en parallèle ; une lecture en échec n'empêche pas les autres. */
async function gather(calls: Record<string, () => Promise<unknown>>) {
  const entries = await Promise.all(
    Object.entries(calls).map(async ([key, fn]) => {
      try {
        return [key, await fn()] as const
      } catch (err) {
        return [key, { erreur: err instanceof Error ? err.message : String(err) }] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}

/** Données pour pré-remplir le profil et générer le plan. */
export function fetchProfileData() {
  return gather({
    queryUserInfo: () => corosRead('queryUserInfo'),
    queryFitnessAssessmentOverview: () => corosRead('queryFitnessAssessmentOverview'),
    queryTrainingLoadAssessment: () => corosRead('queryTrainingLoadAssessment', { days: 28 }),
    queryRecoveryStatus: () => corosRead('queryRecoveryStatus'),
    querySportRecords: () => fetchRunRecords(56),
  })
}

/** Données des 7 derniers jours pour ajuster la semaine. */
export function fetchRecentData() {
  const start = toCoros(addDays(today(), -6))
  const end = toCoros(today())
  return gather({
    querySportRecords: () => fetchRunRecords(7),
    queryRecoveryStatus: () => corosRead('queryRecoveryStatus'),
    querySleepHrv: () => corosRead('querySleepHrv', { startDate: start, endDate: end, days: 7 }),
    querySleepOverview: () => corosRead('querySleepOverview', { days: 7 }),
    queryRestingHeartRate: () => corosRead('queryRestingHeartRate', { days: 7 }),
    queryTrainingLoadAssessment: () => corosRead('queryTrainingLoadAssessment', { days: 7 }),
  })
}
