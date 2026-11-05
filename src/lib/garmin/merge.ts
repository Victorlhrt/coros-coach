import type { Activity } from '@/lib/coros/activities'

export const GARMIN_PREFIX = 'garmin:'
export const isGarminId = (labelId: string | null | undefined) => !!labelId?.startsWith(GARMIN_PREFIX)

/** Activité Garmin telle que renvoyée par le serveur : forme Activity + départ UTC pour le dédoublonnage. */
export type GarminActivity = Activity & { startMs?: number | null }

/** Même sortie = même jour et distance à 2 % près (et départ à 10 min près quand les deux heures sont connues). */
function sameRun(a: GarminActivity, b: GarminActivity) {
  if (a.date !== b.date) return false
  if (a.startMs && b.startMs && Math.abs(a.startMs - b.startMs) > 10 * 60_000) return false
  if (!a.meters || !b.meters) return !!(a.startMs && b.startMs)
  return Math.abs(a.meters - b.meters) / Math.max(a.meters, b.meters) <= 0.02
}

/**
 * Deux sources dans une seule liste (COROS + Garmin, puis montres + archive Strava) : une sortie présente des deux
 * côtés n'est gardée qu'une fois, sous l'identifiant de la première source (envoi des séances, splits connus),
 * complétée par la seconde pour ce qui lui manque (distance, durée, allure, FC, lieu).
 */
export function mergeActivities(primary: GarminActivity[], secondary: GarminActivity[]): Activity[] {
  const used = new Set<GarminActivity>()
  const merged = primary.map(({ startMs: _s, ...p }) => {
    const twin = secondary.find((x) => !used.has(x) && sameRun({ ...p, startMs: _s }, x))
    if (!twin) return p
    used.add(twin)
    const meters = p.meters ?? twin.meters
    const seconds = p.seconds ?? twin.seconds
    return {
      ...p,
      meters,
      seconds,
      paceSecPerKm: p.paceSecPerKm ?? twin.paceSecPerKm ?? (meters && seconds ? seconds / (meters / 1000) : null),
      avgHr: p.avgHr ?? twin.avgHr,
      avgCadence: p.avgCadence ?? twin.avgCadence,
      place: p.place ?? twin.place,
    }
  })
  const kept = secondary.filter((x) => !used.has(x) && !primary.some((p) => sameRun(p, x)))
  return [...merged, ...kept.map(({ startMs: _s, ...a }) => a)].sort((a, b) => b.date.localeCompare(a.date))
}
