export type Units = 'metric' | 'imperial'

const MI = 1609.344

export function formatPace(secPerKm: number, units: Units = 'metric') {
  const s = Math.round(units === 'imperial' ? secPerKm * (MI / 1000) : secPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function paceUnit(units: Units = 'metric') {
  return units === 'imperial' ? '/mi' : '/km'
}

export function formatDistance(meters: number, units: Units = 'metric', digits = 1) {
  const v = units === 'imperial' ? meters / MI : meters / 1000
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${units === 'imperial' ? 'mi' : 'km'}`
}

/** Distance dans l'unité choisie, arrondie au dixième (axes et graphiques). */
export function distanceValue(meters: number, units: Units = 'metric') {
  return Math.round((units === 'imperial' ? meters / MI : meters / 1000) * 10) / 10
}

export function distanceUnit(units: Units = 'metric') {
  return units === 'imperial' ? 'mi' : 'km'
}

/** Nombre au format français, une décimale au plus. */
export const formatNumber = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 1 })

export function formatDuration(seconds: number) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m} min`
}

export function formatClock(seconds: number) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** "4:30" → 270 ; "1:45:00" → 6300 ; null si invalide */
/**
 * Durée saisie par le coureur : « 1:45:00 », « 45:30 », mais aussi « 1h45 », « 1h45m30 », « 45min », « 45' » ou « 45 »
 * (un nombre seul = minutes).
 */
export function parseClock(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  if (!t) return null
  const hms = t.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)(?:m|min|mn|'))?(?:(\d+)(?:s|"|''))?(\d+)?$/)
  if (hms && /[hm'"s]/.test(t)) {
    const [, h, m, sec, tail] = hms
    // « 1h45 » : le nombre qui suit les heures est en minutes ; « 45m30 » : celui qui suit les minutes, en secondes.
    const minutes = Number(m ?? (h && tail ? tail : 0))
    const seconds = Number(sec ?? (m && tail ? tail : 0))
    const total = Number(h ?? 0) * 3600 + minutes * 60 + seconds
    return total > 0 && minutes < 60 && seconds < 60 ? Math.round(total) : null
  }
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) > 0 ? Math.round(Number(t) * 60) : null
  const parts = t.split(':').map((p) => Number(p))
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
