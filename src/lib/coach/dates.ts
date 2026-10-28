/** Dates locales au format YYYY-MM-DD (pas d'UTC : le plan suit le calendrier du coureur). */

export function toIso(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today() {
  return toIso(new Date())
}

export function addDays(iso: string, n: number) {
  const d = fromIso(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export function diffDays(a: string, b: string) {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86_400_000)
}

/** 0 = lundi … 6 = dimanche */
export function weekday(iso: string) {
  return (fromIso(iso).getDay() + 6) % 7
}

export function mondayOf(iso: string) {
  return addDays(iso, -weekday(iso))
}

export function sundayOf(iso: string) {
  return addDays(iso, 6 - weekday(iso))
}

/** yyyyMMdd pour COROS */
export function toCoros(iso: string) {
  return iso.replaceAll('-', '')
}

export function fromCoros(ymd: string | number) {
  const s = String(ymd)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const WEEKDAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Jours en français : réservés aux prompts envoyés à Claude (rédigés en français). */
export const WEEKDAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return fromIso(iso).toLocaleDateString('en-GB', opts)
}

/** Variante française de formatDay, réservée aux prompts envoyés à Claude. */
export function formatDayFr(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return fromIso(iso).toLocaleDateString('fr-FR', opts)
}

export interface WeekSlot {
  number: number
  start: string
  end: string
}

/**
 * Semaines naturelles (lundi-dimanche) du plan, comme COROS : la première peut être partielle.
 * 4 à 16 semaines ; si la course est plus loin, le plan démarre 16 semaines avant.
 */
export function planWeeks(raceDate: string, from = today()): { start: string; weeks: WeekSlot[]; error?: string } {
  const raceSunday = sundayOf(raceDate)
  // Du vendredi au dimanche, on démarre lundi prochain plutôt qu'avec une semaine 1 de 1 à 3 jours.
  let start = weekday(from) >= 4 ? addDays(mondayOf(from), 7) : from
  let count = Math.floor(diffDays(mondayOf(start), raceSunday) / 7) + 1
  if (count > 16) {
    start = addDays(raceSunday, -16 * 7 + 1)
    count = 16
  }
  if (count < 4) return { start, weeks: [], error: 'Your race needs to be at least 4 weeks away (COROS plans run 4 to 16 weeks).' }
  const weeks: WeekSlot[] = []
  for (let i = 0; i < count; i++) {
    const monday = addDays(mondayOf(start), i * 7)
    weeks.push({ number: i + 1, start: i === 0 ? start : monday, end: addDays(monday, 6) })
  }
  return { start, weeks }
}
