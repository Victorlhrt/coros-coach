import type { RaceRecord } from './vdot'

/** Les records saisis à la main priment ; ceux de COROS sont remplacés à chaque lecture (fenêtre de 12 mois). */
export function mergeRecords(current: RaceRecord[], fresh: RaceRecord[]) {
  const manual = current.filter((r) => r.source === 'manual')
  const manualKeys = new Set(manual.map((r) => r.key))
  return [...manual, ...fresh.filter((r) => !manualKeys.has(r.key))]
}
