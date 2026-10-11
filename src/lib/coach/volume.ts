import type { Activity } from '@/lib/coros/activities'
import { addDays, mondayOf, today } from './dates'

export interface Volume {
  /** Moyenne des 4 dernières semaines complètes (lundi-dimanche) */
  avg4w: number
  weeks: { start: string; km: number }[]
  thisMonthKm: number
  lastMonthKm: number
  /** Volume hebdo moyen du mois dernier */
  lastMonthWeekly: number
}

const km = (list: Activity[]) => Math.round(list.reduce((a, x) => a + (x.meters ?? 0), 0) / 100) / 10

/** Volume de course réel calculé à partir des activités COROS (pas d'estimation par Claude). */
export function computeVolume(activities: Activity[], now = today()): Volume {
  const thisMonday = mondayOf(now)
  const weeks = [4, 3, 2, 1].map((n) => {
    const start = addDays(thisMonday, -7 * n)
    const end = addDays(start, 6)
    return { start, km: km(activities.filter((a) => a.date >= start && a.date <= end)) }
  })
  const monthStart = `${now.slice(0, 8)}01`
  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 8)}01`
  const lastMonthDays = Number(addDays(monthStart, -1).slice(8))
  const lastMonthKm = km(activities.filter((a) => a.date >= lastMonthStart && a.date < monthStart))
  return {
    avg4w: Math.round((weeks.reduce((a, w) => a + w.km, 0) / 4) * 10) / 10,
    weeks,
    thisMonthKm: km(activities.filter((a) => a.date >= monthStart && a.date <= now)),
    lastMonthKm,
    lastMonthWeekly: Math.round((lastMonthKm / lastMonthDays) * 7 * 10) / 10,
  }
}
