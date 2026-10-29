import type { Activity } from '@/lib/coros/activities'

export const GARMIN_PREFIX = 'garmin:'
export const isGarminId = (labelId: string | null | undefined) => !!labelId?.startsWith(GARMIN_PREFIX)

/** Activité Garmin telle que renvoyée par le serveur : forme Activity + départ UTC pour le dédoublonnage. */
export type GarminActivity = Activity & { startMs?: number | null }

/**
 * COROS + Garmin dans une seule liste : une sortie enregistrée des deux côtés (montre synchronisée vers les
 * deux comptes) n'est gardée qu'une fois, côté COROS (envoi des séances, splits déjà connus).
 * Même sortie = même jour et distance à 2 % près (et départ à 10 min près quand les deux heures sont connues).
 */
export function mergeActivities(coros: (Activity & { startMs?: number | null })[], garmin: GarminActivity[]): Activity[] {
  const kept = garmin.filter(
    (g) =>
      !coros.some((c) => {
        if (c.date !== g.date) return false
        if (c.startMs && g.startMs && Math.abs(c.startMs - g.startMs) > 10 * 60_000) return false
        if (!c.meters || !g.meters) return !!(c.startMs && g.startMs)
        return Math.abs(c.meters - g.meters) / Math.max(c.meters, g.meters) <= 0.02
      }),
  )
  return [...coros, ...kept.map(({ startMs: _s, ...a }) => a)].sort((a, b) => b.date.localeCompare(a.date))
}
