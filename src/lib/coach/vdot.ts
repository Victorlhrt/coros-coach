/**
 * Formules de Jack Daniels (VDOT) : niveau à partir d'une performance, allure seuil et prédictions.
 * v en mètres/minute, t en minutes.
 */

const vo2AtSpeed = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v
const fractionAtDuration = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)

export function vdot(meters: number, seconds: number) {
  const t = seconds / 60
  return vo2AtSpeed(meters / t) / fractionAtDuration(t)
}

/** Vitesse (m/min) à laquelle on consomme `vo2` */
function speedAtVo2(vo2: number) {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Allure seuil (s/km) ≈ 88 % de la VDOT */
export function thresholdPace(v: number) {
  return Math.round((1000 / speedAtVo2(0.88 * v)) * 60)
}

/** Temps prédit (s) sur une distance pour une VDOT donnée (recherche par dichotomie). */
export function predictTime(v: number, meters: number) {
  let lo = meters / 500 // 30 km/h
  let hi = meters / 50 // 3 km/h
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (vdot(meters, mid * 60) > v) lo = mid
    else hi = mid
  }
  return Math.round(((lo + hi) / 2) * 60)
}

export const RECORD_DISTANCES = [
  { key: '5k', label: '5 km', meters: 5000 },
  { key: '10k', label: '10 km', meters: 10000 },
  { key: 'half', label: 'Half', meters: 21097.5 },
  { key: 'marathon', label: 'Marathon', meters: 42195 },
] as const
export type RecordKey = (typeof RECORD_DISTANCES)[number]['key']

export interface RaceRecord {
  key: RecordKey
  seconds: number
  date: string | null
  source: 'coros' | 'manual'
}

/** Meilleure VDOT parmi les records (la performance la plus solide sert de référence). */
export function bestVdot(records: RaceRecord[]) {
  const values = records.map((r) => vdot(RECORD_DISTANCES.find((d) => d.key === r.key)!.meters, r.seconds))
  return values.length ? Math.round(Math.max(...values) * 10) / 10 : null
}
