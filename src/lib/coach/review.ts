import { useEffect } from 'react'
import { normalizeActivities, type Activity } from '@/lib/coros/activities'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { fetchRecentData } from '@/lib/coros/data'
import { fetchLaps, normalizeLaps } from '@/lib/coros/laps'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { proposeAdjustment } from './adapt'
import { claudeErrorMessage } from './claude'
import { describeFeedback } from './feedback'
import { addDays, today } from './dates'
import { formatClock, formatPace } from './format'
import { trainingTrend } from './guardrails'
import { autoLinks } from './links'
import { isRun, sessionTotals } from './metrics'
import type { Session } from './schema'

function describeActivity(a: Activity) {
  return [
    a.meters ? `${(a.meters / 1000).toFixed(2)} km` : null,
    a.seconds ? formatClock(a.seconds) : null,
    a.paceSecPerKm ? `${formatPace(a.paceSecPerKm)}/km` : null,
  ]
    .filter(Boolean)
    .join(', ')
}

async function describeLaps(a: Activity) {
  try {
    const raw = await fetchLaps(a.labelId, a.sportType)
    const laps = normalizeLaps(raw, a.meters)
    if (laps.length === 0) return `  splits (brut) : ${JSON.stringify(raw).slice(0, 3000)}`
    return laps
      .map(
        (l) =>
          `  tour ${l.index} : ${l.meters ? `${Math.round(l.meters)} m` : '?'} en ${l.seconds ? formatClock(l.seconds) : '?'}` +
          `${l.paceSecPerKm ? ` (${formatPace(l.paceSecPerKm)}/km)` : ''}${l.avgHr ? `, FC ${Math.round(l.avgHr)}` : ''}`,
      )
      .join('\n')
  } catch {
    return '  splits indisponibles'
  }
}

/**
 * Bilan des 7 derniers jours : lie les nouvelles activités, lit les splits, puis demande à Claude
 * les ajustements de la semaine en cours. Le résultat est enregistré comme bilan de la semaine.
 */
export async function runReview() {
  const store = usePlan.getState()
  const { plan, goal } = store
  if (!plan || !goal) throw new Error('Create a plan first.')
  const now = today()
  const week = plan.weeks.find((w) => w.start <= now && w.end >= now)
  if (!week) throw new Error('No plan week covers today.')

  const recent = await fetchRecentData()
  const activities = normalizeActivities(recent.querySportRecords)
  if (activities.length > 0) delete recent.querySportRecords

  store.setLinks(autoLinks(plan, activities, store.links, store.zones))
  const links = usePlan.getState().links

  const from = addDays(now, -7)
  const sessions = allSessions(plan).filter((s) => isRun(s) && s.date >= from && s.date < now)
  const linkedIds = new Set<string>()
  const lines = await Promise.all(
    sessions.map(async (s: Session) => {
      const planned = sessionTotals(s, store.zones)
      const head = `${s.date} prévu : ${s.type} « ${s.title} » (${(planned.meters / 1000).toFixed(1)} km, ${formatClock(planned.seconds)}) — ${JSON.stringify(s.blocks)}`
      const fb = usePlan.getState().feedback[s.id]
      const feeling = fb ? `\n  ressenti du coureur : ${describeFeedback(fb)}` : ''
      const activity = activities.find((a) => a.labelId === links[s.id]?.labelId)
      if (!activity) return `${head}\n  réalisé : ${fb ? 'pas d’activité COROS liée' : 'NON (aucune activité liée)'}${feeling}`
      linkedIds.add(activity.labelId)
      return `${head}\n  réalisé : ${describeActivity(activity)}${feeling}\n${await describeLaps(activity)}`
    }),
  )
  const extra = activities
    .filter((a) => a.date >= from && !linkedIds.has(a.labelId))
    .map((a) => `${a.date} hors plan : ${a.name}, ${describeActivity(a)}`)

  const adjustment = await proposeAdjustment({
    plan,
    goal,
    profile: store.profile,
    zones: store.zones,
    records: store.records,
    trend: trainingTrend(plan, links, usePlan.getState().feedback, store.reviews, store.zones, now),
    recent,
    performance: [...lines, ...extra].join('\n') || 'Aucune séance prévue ni réalisée.',
  })
  usePlan.getState().saveReview(week.number, adjustment)
  return { week: week.number, adjustment }
}

let attempted: string | null = null

/**
 * Bilan automatique : à la première ouverture de chaque nouvelle semaine du plan (à partir de la 2e),
 * le bilan de la semaine écoulée est préparé en arrière-plan. Rien n'est appliqué sans accord.
 */
export function useWeeklyReview() {
  const plan = usePlan((s) => s.plan)
  const reviews = usePlan((s) => s.reviews)
  const connected = useCorosAuth((s) => s.connected)
  const autoReview = useSettings((s) => s.autoReview)
  const now = today()
  const week = plan?.weeks.find((w) => w.start <= now && w.end >= now)

  useEffect(() => {
    if (!plan || !week || week.number < 2 || !connected || !autoReview) return
    const key = `${plan.id}:${week.number}`
    if (reviews[week.number] || attempted === key) return
    attempted = key
    runReview()
      .then(({ adjustment }) =>
        toast.success(
          adjustment.changes.length > 0
            ? `Weekly review ready: ${adjustment.changes.length} suggested change${adjustment.changes.length > 1 ? 's' : ''}`
            : 'Weekly review ready: nothing to change',
        ),
      )
      .catch((err) => toast.error(`Weekly review: ${claudeErrorMessage(err)}`))
  }, [plan, week, reviews, connected, autoReview])
}
