import type { Goal, Phase } from './schema'

const GOAL_KM: Partial<Record<Goal['distance'], number>> = { '5k': 5, '10k': 10, half: 21.0975, marathon: 42.195 }
/** Sortie longue maximale utile selon l'objectif (km). */
const LONG_MAX: Partial<Record<Goal['distance'], number>> = { '5k': 12, '10k': 16, half: 21, marathon: 32 }

export interface PlannedWeek {
  number: number
  /** Semaine allégée, affûtage ou course : le coach adapte la phase et le contenu. */
  kind: 'build' | 'recovery' | 'taper' | 'race'
  phase: Phase
  targetKm: number
  longRunKm: number
}

const half = (n: number) => Math.round(n * 2) / 2

/**
 * Volumes semaine par semaine calculés par l'app (et non laissés au jugement de Claude, trop prudent) :
 * départ au volume actuel, montée de +10 % ou jusqu'à +5 km par semaine jusqu'au pic visé, une semaine allégée
 * (-25 %) sur quatre sur les plans de 10 semaines et plus (une seule à mi-parcours de 7 à 9 semaines, aucune en dessous),
 * puis affûtage (une semaine, deux pour marathon, ultra et trail longs) et semaine de course.
 * Sortie longue : 35 % de la semaine (40 % en trail), plafonnée selon l'objectif.
 */
export function planVolumes(weeks: number, goal: Pick<Goal, 'distance' | 'courseKm' | 'currentWeeklyKm' | 'peakWeeklyKm' | 'terrain'>): PlannedWeek[] {
  const raceKm = goal.courseKm ?? GOAL_KM[goal.distance] ?? 10
  const trail = goal.distance === 'trail' || goal.terrain === 'trail'
  const start = goal.currentWeeklyKm && goal.currentWeeklyKm > 0 ? goal.currentWeeklyKm : Math.max(10, (goal.peakWeeklyKm ?? 30) * 0.5)
  const peak = Math.max(goal.peakWeeklyKm ?? start, start)
  const taper = weeks <= 6 ? 1 : raceKm >= 30 ? 2 : 1
  const build = Math.max(1, weeks - 1 - taper)
  const recovery = new Set<number>()
  if (weeks >= 10) for (let w = 4; w < build; w += 4) recovery.add(w)
  else if (weeks >= 7 && build >= 5) recovery.add(Math.ceil(build / 2) + 1)
  const steps = Array.from({ length: build }, (_, i) => i + 1).filter((w) => w > 1 && !recovery.has(w)).length
  const longMax = trail ? Math.min(35, Math.max(16, raceKm * 0.6)) : (LONG_MAX[goal.distance] ?? 32)
  const ratio = trail ? 0.4 : 0.35

  const out: PlannedWeek[] = []
  let current = Math.round(start)
  let top = current
  for (let w = 1; w <= build; w++) {
    let km: number
    if (w === 1) km = current
    else if (recovery.has(w)) km = Math.round(top * 0.75)
    else {
      const left = steps - out.filter((x) => x.kind === 'build' && x.number > 1).length
      const wanted = (peak - top) / Math.max(1, left)
      km = Math.round(Math.min(peak, top + Math.min(Math.max(wanted, 0), Math.max(top * 0.1, 5))))
    }
    const kind = recovery.has(w) ? 'recovery' : 'build'
    if (kind === 'build') top = Math.max(top, km)
    current = km
    // Semaine allégée : même phase que la semaine précédente (une semaine allégée n'est pas un « peak »).
    const phase: Phase = kind === 'recovery' && out.length ? out[out.length - 1].phase : w <= build * 0.4 && weeks >= 10 ? 'base' : w > build - 3 ? 'peak' : 'build'
    out.push({ number: w, kind, phase, targetKm: km, longRunKm: Math.min(longMax, half(km * ratio)) })
  }
  const tapers = taper === 2 ? [0.7, 0.5] : [0.6]
  tapers.forEach((f, i) => {
    const km = Math.round(top * f)
    out.push({ number: build + i + 1, kind: 'taper', phase: 'taper', targetKm: km, longRunKm: Math.min(longMax, half(km * ratio)) })
  })
  out.push({ number: weeks, kind: 'race', phase: 'race', targetKm: Math.round(raceKm + top * 0.15), longRunKm: half(raceKm) })
  return out
}
