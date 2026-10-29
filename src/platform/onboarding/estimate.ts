/**
 * Estimation de temps de course à partir des performances connues.
 * Formule de Riegel (T2 = T1 × (D2 / D1)^1,06) sur une distance « effort » : en trail,
 * 100 m de dénivelé positif comptent comme 1 km de plat (règle du km-effort).
 */

export type Performance = { label: string; km: number; elevation: number; seconds: number; date?: string; source: 'utmb' | 'manuel' | 'strava' | 'coros' | 'garmin' }

export const effortKm = (km: number, elevation = 0) => km + elevation / 100

export function riegel(from: Performance, km: number, elevation = 0, exponent = 1.06) {
  return from.seconds * Math.pow(effortKm(km, elevation) / effortKm(from.km, from.elevation), exponent)
}

/**
 * Médiane des prédictions issues des performances récentes (moins de deux ans), en privilégiant
 * celles dont la distance-effort est la plus proche de l'objectif. `null` sans donnée exploitable.
 */
export function predict(perfs: Performance[], km: number, elevation = 0): { seconds: number; basedOn: Performance[] } | null {
  const now = Date.now()
  const target = effortKm(km, elevation)
  const usable = perfs
    .filter((p) => p.km >= 3 && p.seconds > 0 && (!p.date || now - Date.parse(p.date) < 2 * 365 * 86400_000))
    .sort((a, b) => Math.abs(Math.log(effortKm(a.km, a.elevation) / target)) - Math.abs(Math.log(effortKm(b.km, b.elevation) / target)))
    .slice(0, 3)
  if (!usable.length) return null
  const preds = usable.map((p) => riegel(p, km, elevation)).sort((a, b) => a - b)
  return { seconds: preds[Math.floor(preds.length / 2)], basedOn: usable }
}

/** Durée « h:mm:ss », « mm:ss » ou « 1h45 » en secondes ; `null` si illisible ou absente (abandon). */
export function parseDuration(text: string | null | undefined): number | null {
  if (!text) return null
  const parts = text.trim().split(/[:h'’"]/).filter(Boolean).map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null
  const [h, m, s] = parts.length === 3 ? parts : parts.length === 2 ? [0, ...parts] : [0, parts[0], 0]
  const total = h * 3600 + m * 60 + s
  return total > 0 ? total : null
}

export function formatDuration(seconds: number) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

export function formatPace(seconds: number, km: number) {
  const p = seconds / km
  return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')} /km`
}

/** Catégorie de distance utilisée par le plan (et par le back office). */
export function distanceCategory(km: number, elevation = 0): string {
  if (elevation > km * 15 || elevation > 500) return 'trail'
  if (km <= 7) return '5k'
  if (km <= 15) return '10k'
  if (km <= 30) return 'half'
  return 'marathon'
}
