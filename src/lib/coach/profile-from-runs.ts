import type { Activity } from '@/lib/coros/activities'
import { isGarminId } from '@/lib/garmin/merge'
import { addDays, today } from './dates'
import type { Profile } from './schema'
import { RECORD_DISTANCES, bestVdot, predictTime, thresholdPace, type RaceRecord } from './vdot'
import { computeVolume, type Volume } from './volume'

/** Meilleur temps des 12 derniers mois sur 5 km à marathon : sorties entières de la bonne distance (−1 % à +8 %). */
export function recordsFromRuns(activities: Activity[], now = today()): RaceRecord[] {
  const year = activities.filter((a) => a.date >= addDays(now, -365))
  return RECORD_DISTANCES.flatMap((d) => {
    const best = year
      .filter((a) => a.meters && a.seconds && a.meters >= d.meters * 0.99 && a.meters <= d.meters * 1.08)
      .map((a) => ({ a, seconds: Math.round(a.seconds! * (d.meters / a.meters!)) }))
      .sort((x, y) => x.seconds - y.seconds)[0]
    if (!best) return []
    const source = isGarminId(best.a.labelId) ? ('garmin' as const) : best.a.labelId.startsWith('strava:') ? ('strava' as const) : ('coros' as const)
    return [{ key: d.key, seconds: best.seconds, date: best.a.date, source }]
  })
}

/**
 * Profil calculé sans Claude à partir des sorties (Garmin, archive Strava) : volume, plus longue sortie,
 * meilleurs temps sur 5 km à marathon (sorties entières de la bonne distance), allure seuil et VO2max par la VDOT.
 * COROS garde sa lecture complète (forme, récupération) dans `fetchProfileData`.
 */
export function profileFromRuns(activities: Activity[], now = today()): { profile: Profile; volume: Volume; records: RaceRecord[] } {
  const volume = computeVolume(activities, now)
  const records = recordsFromRuns(activities, now)
  const v = bestVdot(records)
  const recent = activities.filter((a) => a.date >= addDays(now, -56))
  const longest = recent.reduce((m, a) => Math.max(m, a.meters ?? 0), 0)
  const predict = (meters: number) => (v ? Math.round(predictTime(v, meters)) : null)
  const profile: Profile = {
    thresholdPace: v ? Math.round(thresholdPace(v)) : null,
    lthr: null,
    maxHr: null,
    restingHr: null,
    vo2max: v,
    predictions: { fiveK: predict(5000), tenK: predict(10000), half: predict(21097.5), marathon: predict(42195) },
    weeklyKm: volume.avg4w || null,
    longestRunKm: longest ? Math.round(longest / 100) / 10 : null,
    runsPerWeek: recent.length ? Math.round((recent.length / 8) * 10) / 10 : null,
    notes: v
      ? `Read from ${recent.length} runs over the last 8 weeks. Paces come from your best times of the last 12 months.`
      : `Read from ${recent.length} runs over the last 8 weeks. No full 5 km to marathon effort in the last 12 months: set your paces from a recent race time.`,
  }
  return { profile, volume, records }
}
