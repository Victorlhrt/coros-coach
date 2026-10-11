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
  return `${v.toFixed(v >= 100 ? 0 : digits).replace('.', ',')} ${units === 'imperial' ? 'mi' : 'km'}`
}

export function formatDuration(seconds: number) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`
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
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':').map((p) => Number(p))
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
