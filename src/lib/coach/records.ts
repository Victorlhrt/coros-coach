import type { RaceRecord } from './vdot'

/** Les records saisis à la main priment ; ceux des montres et de Strava sont remplacés à chaque lecture (fenêtre de 12 mois). */
export function mergeRecords(current: RaceRecord[], fresh: RaceRecord[]) {
  const manual = current.filter((r) => r.source === 'manual')
  const manualKeys = new Set(manual.map((r) => r.key))
  return [...manual, ...fresh.filter((r) => !manualKeys.has(r.key))]
}

/** Le meilleur temps de chaque distance parmi plusieurs sources (montre, archive Strava). */
export function fastestRecords(...lists: RaceRecord[][]) {
  const best = new Map<RaceRecord['key'], RaceRecord>()
  for (const r of lists.flat()) {
    const cur = best.get(r.key)
    if (!cur || r.seconds < cur.seconds) best.set(r.key, r)
  }
  return [...best.values()]
}
