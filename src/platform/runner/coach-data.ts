import type { Activity } from '@/lib/coros/activities'
import { addDays, formatDay, mondayOf } from '@/lib/coach/dates'
import { isRun, sessionTotals } from '@/lib/coach/metrics'
import type { Plan, Session, SessionType, Week, Zone } from '@/lib/coach/schema'

/**
 * Calculs de l'espace coureur à partir du plan et des activités COROS : anneaux de la semaine,
 * terrain du plan, indicateurs et écarts à la moyenne. Fonctions pures, sans état.
 */

export type ActivityLink = { labelId?: string | null }

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/** Intensité perçue d'un type de séance, de 1 (facile) à 3 (dur). */
export const INTENSITY: Record<SessionType, 1 | 2 | 3> = { recovery: 1, easy: 1, strength: 1, long: 2, tempo: 2, interval: 3, race: 3 }

export function currentWeek(plan: Plan, now: string): Week | undefined {
  return plan.weeks.find((w) => w.start <= now && w.end >= now)
}

/** Les 7 jours (lundi → dimanche) qui contiennent `week`, même si la semaine du plan commence un autre jour. */
export function weekDays(week: Week) {
  const monday = mondayOf(week.start)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Une séance est faite si une activité COROS y est liée, ou (renfo) si un ressenti a été donné. */
export function isDone(s: Session, links: Record<string, ActivityLink>, feedback: Record<string, unknown>) {
  return !!links[s.id]?.labelId || (s.type === 'strength' && !!feedback[s.id])
}

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)

/** Anneaux de la semaine : volume couru, séances faites, temps d'entraînement, et la même chose jour par jour. */
export function weekRings(week: Week, zones: Zone[], activities: Activity[], links: Record<string, ActivityLink>, feedback: Record<string, unknown>) {
  const days = weekDays(week)
  const runs = week.sessions.filter(isRun)
  const plannedM = sumBy(runs, (s) => sessionTotals(s, zones).meters)
  const plannedS = sumBy(week.sessions, (s) => sessionTotals(s, zones).seconds)
  const inWeek = activities.filter((a) => a.date >= days[0] && a.date <= days[6])
  const doneM = sumBy(inWeek, (a) => a.meters ?? 0)
  const doneS = sumBy(inWeek, (a) => a.seconds ?? 0)
  const doneN = week.sessions.filter((s) => isDone(s, links, feedback)).length
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)

  const perDay = days.map((d) => {
    const planned = week.sessions.filter((s) => s.date === d)
    const acts = inWeek.filter((a) => a.date === d)
    const pm = sumBy(planned.filter(isRun), (s) => sessionTotals(s, zones).meters)
    const ps = sumBy(planned, (s) => sessionTotals(s, zones).seconds)
    return {
      key: d,
      values: [
        pm > 0 ? ratio(sumBy(acts, (a) => a.meters ?? 0), pm) : 0,
        planned.length ? ratio(planned.filter((s) => isDone(s, links, feedback)).length, planned.length) : 0,
        ps > 0 ? ratio(sumBy(acts, (a) => a.seconds ?? 0), ps) : 0,
      ],
    }
  })

  return {
    volume: { done: doneM, planned: plannedM, value: ratio(doneM, plannedM) },
    sessions: { done: doneN, planned: week.sessions.length, value: ratio(doneN, week.sessions.length) },
    time: { done: doneS, planned: plannedS, value: ratio(doneS, plannedS) },
    perDay,
  }
}

/** Terrain du plan : lignes = jours de la semaine, colonnes = semaines du plan. */
export function planTerrain(plan: Plan, zones: Zone[]) {
  const grid = (f: (s: Session) => number) =>
    WEEKDAY_LABELS.map((_, day) =>
      plan.weeks.map((w) => {
        const d = addDays(mondayOf(w.start), day)
        return sumBy(
          w.sessions.filter((s) => s.date === d),
          f,
        )
      }),
    )
  return {
    rowLabels: WEEKDAY_LABELS,
    colLabels: plan.weeks.map((w) => `S${w.number}`),
    distance: grid((s) => (isRun(s) ? sessionTotals(s, zones).meters / 1000 : 0)),
    duration: grid((s) => sessionTotals(s, zones).seconds / 60),
    intensity: grid((s) => INTENSITY[s.type]),
  }
}

/** Semaines glissantes (lundi) des `n` dernières semaines, la plus ancienne d'abord. */
export function lastWeeks(now: string, n: number) {
  const monday = mondayOf(now)
  return Array.from({ length: n }, (_, i) => addDays(monday, -7 * (n - 1 - i)))
}

/** Indicateurs par semaine : réalisé (activités) et prévu (plan). */
export function weeklyMetrics(starts: string[], activities: Activity[], plan: Plan | null, zones: Zone[]) {
  const sessions = plan?.weeks.flatMap((w) => w.sessions) ?? []
  return starts.map((start) => {
    const end = addDays(start, 6)
    const acts = activities.filter((a) => a.date >= start && a.date <= end)
    const planned = sessions.filter((s) => s.date >= start && s.date <= end)
    const meters = sumBy(acts, (a) => a.meters ?? 0)
    const seconds = sumBy(acts, (a) => a.seconds ?? 0)
    const paced = acts.filter((a) => a.paceSecPerKm && a.meters)
    const paceMeters = sumBy(paced, (a) => a.meters ?? 0)
    return {
      start,
      label: formatDay(start, { day: 'numeric', month: 'short' }),
      km: meters / 1000,
      hours: seconds / 3600,
      runs: acts.length,
      pace: paceMeters > 0 ? sumBy(paced, (a) => (a.paceSecPerKm ?? 0) * (a.meters ?? 0)) / paceMeters : 0,
      plannedKm: sumBy(planned.filter(isRun), (s) => sessionTotals(s, zones).meters) / 1000,
      plannedRuns: planned.filter(isRun).length,
    }
  })
}

/**
 * Écart à la moyenne, jour par jour, sur une fenêtre glissante de 7 jours : volume, durée, sorties,
 * allure (positive quand on court plus vite que d'habitude). En %, pour le graphique horizon.
 */
export function baselineDeviation(activities: Activity[], now: string, days = 42) {
  const dates = Array.from({ length: days }, (_, i) => addDays(now, i - days + 1))
  const rolling = (f: (acts: Activity[]) => number) =>
    dates.map((d) => {
      const from = addDays(d, -6)
      return f(activities.filter((a) => a.date >= from && a.date <= d))
    })
  const pace = (acts: Activity[]) => {
    const m = sumBy(acts, (a) => (a.paceSecPerKm ? (a.meters ?? 0) : 0))
    return m > 0 ? sumBy(acts, (a) => (a.paceSecPerKm ?? 0) * (a.meters ?? 0)) / m : 0
  }
  const series = [
    { id: 'km', name: 'Volume', raw: rolling((a) => sumBy(a, (x) => x.meters ?? 0)), invert: false },
    { id: 'time', name: 'Durée', raw: rolling((a) => sumBy(a, (x) => x.seconds ?? 0)), invert: false },
    { id: 'runs', name: 'Sorties', raw: rolling((a) => a.length), invert: false },
    { id: 'pace', name: 'Allure', raw: rolling(pace), invert: true },
  ]
  return {
    pointLabels: dates.map((d) => formatDay(d, { weekday: 'short', day: 'numeric', month: 'short' })),
    series: series.map(({ id, name, raw, invert }) => {
      const usable = raw.filter((v) => v > 0)
      const avg = usable.length ? sumBy(usable, (v) => v) / usable.length : 0
      return {
        id,
        name,
        values: raw.map((v) => (avg > 0 && v > 0 ? Math.round(((invert ? avg - v : v - avg) / avg) * 100) : 0)),
      }
    }),
  }
}
