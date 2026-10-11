import { addDays, toCoros, today } from '@/lib/coach/dates'
import { RECORD_DISTANCES, type RaceRecord } from '@/lib/coach/vdot'
import { normalizeActivities } from './activities'
import { corosRead } from './client'

const RUN_CODES = [100, 101, 102, 103]

interface RecordsQuery {
  startDate: string
  endDate: string
  codes?: number[]
  minKm?: number
  maxKm?: number
  limit?: number
}

/**
 * querySportRecords déclare tous ses filtres comme requis : on envoie d'abord des null,
 * puis des valeurs permissives si le serveur les refuse.
 */
export async function querySportRecords({ startDate, endDate, codes = RUN_CODES, minKm, maxKm, limit = 100 }: RecordsQuery) {
  const base = { startDate: toCoros(startDate), endDate: toCoros(endDate), sportTypeCodes: codes, limit }
  try {
    return await corosRead('querySportRecords', {
      ...base,
      minDistanceKm: minKm ?? null,
      maxDistanceKm: maxKm ?? null,
      minDurationMinutes: null,
      maxDurationMinutes: null,
      maxAveragePace: null,
      locationKeyword: null,
    })
  } catch {
    return corosRead('querySportRecords', {
      ...base,
      minDistanceKm: minKm ?? 0,
      maxDistanceKm: maxKm ?? 1000,
      minDurationMinutes: 0,
      maxDurationMinutes: 6000,
      maxAveragePace: '59:59',
      locationKeyword: '',
    })
  }
}

export function fetchRunRecords(days: number) {
  return querySportRecords({ startDate: addDays(today(), -days), endDate: today() })
}

/**
 * Records des 12 derniers mois : pour chaque distance, les sorties de cette longueur (+0 à 8 %),
 * hors trail et tapis, et on garde la meilleure allure ramenée à la distance exacte.
 */
export async function fetchRecords(): Promise<RaceRecord[]> {
  const results = await Promise.all(
    RECORD_DISTANCES.map(async (d) => {
      const km = d.meters / 1000
      const raw = await querySportRecords({
        startDate: addDays(today(), -365),
        endDate: today(),
        codes: [100, 103],
        minKm: Math.floor(km * 0.99 * 100) / 100,
        maxKm: Math.ceil(km * 1.08 * 100) / 100,
        limit: 100,
      }).catch(() => null)
      const best = normalizeActivities(raw)
        .filter((a) => a.meters && a.seconds && a.meters >= d.meters * 0.99 && a.meters <= d.meters * 1.08)
        .map((a) => ({ a, seconds: Math.round(a.seconds! * (d.meters / a.meters!)) }))
        .sort((x, y) => x.seconds - y.seconds)[0]
      return best ? { key: d.key, seconds: best.seconds, date: best.a.date, source: 'coros' as const } : null
    }),
  )
  return results.filter((r) => r !== null)
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
