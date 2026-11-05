import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Moon, Star, Wand2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { Countdown } from '@/components/arc/countdown/countdown'
import { ActivityTerrain } from '@/components/raice/activity-terrain'
import { MetricsDashboard, type Kpi } from '@/components/raice/metrics-dashboard'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { RefreshButton } from '@/components/raice/stretch-refresh'
import { WeekPicker, type PickerDay } from '@/components/raice/week-picker'
import { TypeBadge } from '@/components/TypeBadge'
import { WeekView } from './WeekView'
import { CoachAvatar } from '../onboarding/CoachAvatar'
import { WorkoutChart } from '@/components/WorkoutChart'
import { Button } from '@/components/shadcn/button'
import { WEEKDAYS, addDays, formatDay, mondayOf, today } from '@/lib/coach/dates'
import { distanceUnit, distanceValue, formatDistance, formatDuration, formatNumber, formatPace } from '@/lib/coach/format'
import { isRun, sessionTotals, weekMeters } from '@/lib/coach/metrics'
import { ROUTES } from '@/lib/coach/routes'
import type { Session, Week } from '@/lib/coach/schema'
import { PHASE_LABEL, TYPE_META } from '@/lib/coach/ui'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useStravaImportStatus } from '@/lib/strava/imported'
import { useHasRunData, useHasWatch } from '@/lib/watch'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { INTENSITY, WEEKDAY_LABELS, currentWeek, isDone, lastWeeks, planTerrain, weekDays, weeklyMetrics } from './coach-data'

/**
 * Onglets du coach dans l'espace coureur, construits avec les panneaux Raice (style Arc) :
 * Home (séance du jour, objectif, anneaux de la semaine), Plan (semaine jour par jour, terrain du plan)
 * et Analytics › Runs (indicateurs, journal).
 */


/** Bouton d'actualisation de l'en-tête : relance la lecture COROS, l'icône tourne le temps du chargement. */
function RefreshAction({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [refreshing, setRefreshing] = useState(false)
  return (
    <RefreshButton
      refreshing={refreshing}
      onClick={() => {
        setRefreshing(true)
        void onRefresh().finally(() => setRefreshing(false))
      }}
    />
  )
}

function useRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['coros'] })
}

// ---------- Home ----------

export function HomeTab() {
  const { plan, reviews, feedback, links } = usePlan()
  const refresh = useRefresh()
  const [now] = useState(today)
  if (!plan) return null

  const week = currentWeek(plan, now)
  const review = week ? reviews[week.number] : undefined
  const toRate = allSessions(plan)
    .filter((s) => s.date <= now && s.date >= addDays(now, -3) && !feedback[s.id] && (s.type === 'strength' || links[s.id]?.labelId))
    .at(-1)
  const todays = allSessions(plan).filter((s) => s.date === now)
  const next = allSessions(plan).find((s) => s.date > now)

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        <header className="flex items-end justify-between gap-4 pb-2">
          <div>
            <p className="text-muted-foreground text-sm">{formatDay(now)}</p>
            <h1 className="font-heading font-medium text-2xl tracking-tight">Today</h1>
          </div>
          <RefreshAction onRefresh={refresh} />
        </header>

        <StravaOffer />

        {(review?.status === 'pending' || toRate) && (
          <div className="flex flex-col gap-4">
            {review?.status === 'pending' && (
              <Notice to={ROUTES.adjust} icon={<Wand2 />} title="Your weekly review is ready" color="var(--session-long)">
                {review.adjustment.changes.length > 0 ? `${review.adjustment.changes.length} suggested change${review.adjustment.changes.length > 1 ? 's' : ''}` : 'Nothing to change, read the analysis'}
              </Notice>
            )}
            {toRate && (
              <Notice to={`${ROUTES.session(toRate.id)}#ressenti`} icon={<Star />} title="How did your session go?" color="var(--session-tempo)">
                {toRate.title} · {formatDay(toRate.date, { weekday: 'long' })}
              </Notice>
            )}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Panel className="flex flex-col">
            <PanelHeader title="Today’s session" subtitle={todays.length ? `${todays.length} session${todays.length > 1 ? 's' : ''} planned` : 'Rest day'} />
            {todays.length ? (
              todays.map((s, i) => <TodaySession key={s.id} session={s} divided={i > 0} />)
            ) : (
              <PanelSection className="flex flex-1 items-center gap-4">
                <span className="flex size-12 items-center justify-center rounded-2xl border">
                  <Moon className="size-5 text-muted-foreground" />
                </span>
                <div>
                  <p className="font-medium">Rest day</p>
                </div>
              </PanelSection>
            )}
            {next && (
              <PanelFooter className="mt-auto">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: TYPE_META[next.type].color }} />
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">Next · {formatDay(next.date, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                    <p className="truncate font-medium text-sm">{next.title}</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={ROUTES.session(next.id)}>
                    View <ArrowRight />
                  </Link>
                </Button>
              </PanelFooter>
            )}
          </Panel>
          <GoalPanel />
        </div>

        {week && <ThisWeek week={week} now={now} />}
      </div>
    </>
  )
}

/** La semaine en cours, sans couleur : seulement les séances qu'il reste à faire. */
function ThisWeek({ week, now }: { week: Week; now: string }) {
  const { zones, links, feedback } = usePlan()
  const units = useSettings((s) => s.units)
  const days = weekDays(week)
  const left = week.sessions.filter((s) => s.date >= now && !isDone(s, links, feedback))
  return (
    <Panel>
      <PanelHeader
        title={`Week ${week.number} · ${PHASE_LABEL[week.phase]}`}
        subtitle={`${formatDay(days[0], { day: 'numeric', month: 'short' })} – ${formatDay(days[6], { day: 'numeric', month: 'short' })}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.adjust}>
              <Wand2 /> Adjust my week
            </Link>
          </Button>
        }
      />
      <div className="border-t">
        <p className="px-6 pt-4 pb-1 text-muted-foreground text-xs">
          {left.length ? `${left.length} session${left.length > 1 ? 's' : ''} left this week` : 'All sessions done this week'}
        </p>
        {left.map((s) => {
          const t = sessionTotals(s, zones)
          return (
            <Link key={s.id} to={ROUTES.session(s.id)} className="flex items-center gap-4 border-t px-6 py-3 transition-colors first-of-type:border-t-0 hover:bg-foreground/[0.03]">
              <span className="w-24 shrink-0 text-muted-foreground text-sm">{s.date === now ? 'Today' : formatDay(s.date, { weekday: 'short', day: 'numeric' })}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-sm">{s.title}</span>
              <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
                {formatDuration(t.seconds)}
                {t.meters > 0 ? ` · ${formatDistance(t.meters, units)}` : ''}
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )
        })}
      </div>
    </Panel>
  )
}

const STRAVA_OFFER_KEY = 'strava-offer.dismissed'

/**
 * Après l'onboarding, un coureur qui a connecté sa montre se voit proposer d'ajouter son historique Strava
 * (sorties d'avant la montre, doublons écartés). Disparaît une fois l'import fait ou la proposition fermée.
 */
function StravaOffer() {
  const watch = useHasWatch()
  const status = useStravaImportStatus()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STRAVA_OFFER_KEY) === '1'
    } catch {
      return false
    }
  })
  if (!watch || dismissed || status.isPending || status.data?.importedAt || (status.data?.runs ?? 0) > 0) return null
  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(STRAVA_OFFER_KEY, '1')
    } catch {
      /* sans stockage, la proposition reviendra */
    }
  }
  return (
    <div className="relative">
      <Notice to={`${ROUTES.settings}#strava`} icon={<img src="/partners/strava.png" alt="" className="size-5 rounded-[5px]" />} title="Add your Strava history" color="#fc4c02">
        Import your Strava archive so your coach sees the runs from before your watch.
      </Notice>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute top-2 right-2 rounded-full p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function Notice({ to, icon, title, color, children }: { to: string; icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-[24px] border bg-card px-5 py-4 transition-colors hover:border-foreground/30">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full [&>svg]:size-4.5" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm">{title}</span>
        <span className="block truncate text-muted-foreground text-sm">{children}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function TodaySession({ session, divided }: { session: Session; divided?: boolean }) {
  const zones = usePlan((s) => s.zones)
  const units = useSettings((s) => s.units)
  const { seconds, meters } = sessionTotals(session, zones)
  const pace = meters > 0 ? seconds / (meters / 1000) : 0
  const color = TYPE_META[session.type].color
  return (
    <PanelSection
      divided
      className="flex flex-col gap-5"
      data-divided={divided}
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 12%, transparent), transparent 70%)` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <TypeBadge type={session.type} />
          <h3 className="mt-2 font-heading font-medium text-2xl tracking-tight">{session.title}</h3>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{session.description}</p>
        </div>
        <Button asChild>
          <Link to={ROUTES.session(session.id)}>
            Open session <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 divide-x rounded-2xl border bg-card/60">
        <Stat label="Duration" value={formatDuration(seconds)} color={color} />
        <Stat label="Distance" value={meters > 0 ? formatDistance(meters, units) : '—'} />
        <Stat label="Avg pace" value={pace > 0 ? `${formatPace(pace, units)}` : '—'} />
      </div>
      {session.blocks.length > 0 && <WorkoutChart blocks={session.blocks} zones={zones} className="h-14" />}
    </PanelSection>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 font-medium text-xl tabular-nums tracking-tight" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  )
}

function GoalPanel() {
  const { plan, goal } = usePlan()
  if (!plan) return null
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title={plan.name}
        subtitle={formatDay(plan.raceDate, { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <Link to={ROUTES.goal} className="text-muted-foreground text-sm hover:text-foreground">
            Edit
          </Link>
        }
      />
      <PanelSection divided className="flex flex-1 items-center justify-center py-8">
        <Countdown target={`${plan.raceDate}T08:00:00`} timeZone="Europe/Paris" units={['days', 'hours', 'minutes']} label="Until the race" completeLabel="It’s race day" className="w-full" />
      </PanelSection>
      {goal?.targetTime ? (
        <PanelFooter>
          <span className="text-muted-foreground text-sm">Target time</span>
          <span className="font-medium tabular-nums">{formatDuration(goal.targetTime)}</span>
        </PanelFooter>
      ) : null}
    </Panel>
  )
}

// ---------- Plan ----------

export function PlanTab() {
  const { plan, zones, links, feedback, goal } = usePlan()
  const units = useSettings((s) => s.units)
  const navigate = useNavigate()
  const refresh = useRefresh()
  const [now] = useState(today)
  const current = plan ? (currentWeek(plan, now)?.number ?? 1) : 1
  const [selectedWeek, setSelectedWeek] = useState(current)
  const [selectedDay, setSelectedDay] = useState(now)
  const terrain = useMemo(() => (plan ? planTerrain(plan, zones) : null), [plan, zones])
  if (!plan || !terrain) return null

  const week = plan.weeks.find((w) => w.number === selectedWeek) ?? plan.weeks[0]
  const days = weekDays(week)
  const dayKey = days.includes(selectedDay) ? selectedDay : (days.find((d) => week.sessions.some((s) => s.date === d)) ?? days[0])
  const volumes = plan.weeks.map((w) => weekMeters(w.sessions.filter(isRun), zones))
  const types = [...new Set(week.sessions.map((s) => s.type))]

  const pickerDays: PickerDay[] = days.map((d, i) => {
    const sessions = week.sessions.filter((s) => s.date === d)
    const allDone = sessions.length > 0 && sessions.every((s) => isDone(s, links, feedback))
    return {
      key: d,
      weekday: WEEKDAY_LABELS[i],
      day: Number(d.slice(8)),
      caption: sessions.length === 0 ? 'Rest' : allDone ? 'Done ✓' : sessions.length > 1 ? `${sessions.length} sessions` : TYPE_META[sessions[0].type].label,
      isToday: d === now,
      outside: d < week.start || d > week.end,
      sessions: sessions.map((s) => {
        const t = sessionTotals(s, zones)
        return {
          id: s.id,
          primary: t.meters > 0 ? formatDistance(t.meters, units) : formatDuration(t.seconds),
          title: s.title,
          subtitle: `${TYPE_META[s.type].label} · ${formatDuration(t.seconds)}`,
          color: TYPE_META[s.type].color,
          intensity: INTENSITY[s.type],
          done: isDone(s, links, feedback),
        }
      }),
    }
  })
  const goWeek = (n: number) => {
    setSelectedWeek(n)
    const w = plan.weeks.find((x) => x.number === n)
    if (w) setSelectedDay(w.number === current ? now : (w.sessions[0]?.date ?? mondayOf(w.start)))
  }
  const fmtKm = (v: number) => `${formatNumber(v)} km`
  const fmtMin = (v: number) => formatDuration(v * 60)

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
          <div>
            <p className="text-muted-foreground text-sm">
              {plan.weeks.length} weeks · race on {formatDay(plan.raceDate, { day: 'numeric', month: 'long' })}
            </p>
            <h1 className="font-heading font-medium text-2xl tracking-tight">{plan.name}</h1>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.goal}>Goal</Link>
          </Button>
        </header>

        <WeekPicker
          title={`Week ${week.number} · ${formatDay(days[0], { day: 'numeric', month: 'short' })} – ${formatDay(days[6], { day: 'numeric', month: 'short' })}`}
          subtitle={`${PHASE_LABEL[week.phase]} · ${formatDistance(volumes[week.number - 1], units, 0)}${week.targetGain ? ` · ${week.targetGain.toLocaleString('en-GB')} m D+` : ''} planned · ${week.sessions.length} session${week.sessions.length > 1 ? 's' : ''}`}
          actions={
            <>
              <Button variant="outline" size="icon" aria-label="Previous week" disabled={week.number <= 1} onClick={() => goWeek(week.number - 1)}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" aria-label="Next week" disabled={week.number >= plan.weeks.length} onClick={() => goWeek(week.number + 1)}>
                <ChevronRight />
              </Button>
              <RefreshAction onRefresh={refresh} />
            </>
          }
          days={pickerDays}
          selected={dayKey}
          onSelect={setSelectedDay}
          dateLabel={(k) => formatDay(k, { weekday: 'long', day: 'numeric', month: 'long' })}
          legend={types.map((t) => ({ label: TYPE_META[t].label, color: TYPE_META[t].color }))}
          onOpenSession={(id) => navigate(ROUTES.session(id))}
          footerCaption={week.number === current ? 'This week' : week.number < current ? 'Past week' : 'Upcoming'}
          footerSummary={`${week.sessions.filter((s) => isDone(s, links, feedback)).length} / ${week.sessions.length} sessions done · ${formatDistance(volumes[week.number - 1], units, 0)} planned`}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel className="flex flex-col">
            <PanelHeader title="Plan volume" />
            <PanelSection divided>
              <BarChart
                data={plan.weeks.map((w, i) => ({ key: String(w.number), label: `Week ${w.number}`, axisLabel: `W${w.number}`, value: distanceValue(volumes[i], units) }))}
                label="Planned volume"
                period={`${plan.weeks.length} weeks`}
                unit={distanceUnit(units)}
                averageLabel="Weekly average"
                valueLabel="Planned volume"
                categoryLabel="Week"
                showAverage={false}
                height={300}
                formatValue={formatNumber}
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {plan.weeks.map((w) => (
                  <button
                    key={w.number}
                    type="button"
                    onClick={() => goWeek(w.number)}
                    aria-pressed={w.number === week.number}
                    className={`h-8 min-w-9 rounded-full border px-2.5 text-xs transition-colors ${
                      w.number === week.number ? 'border-foreground/50 bg-foreground/10 text-foreground' : w.number === current ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    W{w.number}
                  </button>
                ))}
              </div>
            </PanelSection>
          </Panel>

          <ActivityTerrain
            title="The shape of your plan"
                        rowLabels={terrain.rowLabels}
            colLabels={terrain.colLabels}
            metrics={[
              { id: 'distance', label: 'Distance', values: terrain.distance, format: fmtKm },
              { id: 'duration', label: 'Duration', values: terrain.duration, format: fmtMin },
              { id: 'intensity', label: 'Intensity', values: terrain.intensity, format: (v) => (v === 0 ? 'Rest' : ['', 'Easy', 'Moderate', 'Hard'][Math.min(3, Math.round(v))] ?? 'Hard') },
            ]}
            stats={[
              { label: 'Total volume', value: fmtKm(Math.round(volumes.reduce((a, v) => a + v, 0) / 1000)), detail: `${allSessions(plan).length} sessions` },
              {
                label: 'Biggest weeks',
                value: '',
                list: plan.weeks
                  .map((w, i) => ({ label: `Week ${w.number}`, km: volumes[i] }))
                  .sort((a, b) => b.km - a.km)
                  .slice(0, 3)
                  .map((w) => ({ label: w.label, value: formatDistance(w.km, units, 0) })),
              },
              { label: 'Long run day', value: goal ? WEEKDAYS[goal.longRunDay] : '—' },
            ]}
            hint="Hover a bar for details."
          />
        </div>

        {(plan.raceStrategy || goal?.course) && (
          <Panel>
            <PanelHeader title="Race strategy" subtitle={goal?.course ? `${formatNumber(goal.course.distanceKm)} km · ${goal.course.gain} m elevation gain` : undefined} />
            {plan.raceStrategy && (
              <PanelSection divided className="flex gap-4">
                <CoachAvatar className="size-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">Josh</p>
                  <RaceStrategy text={plan.raceStrategy} />
                </div>
              </PanelSection>
            )}
          </Panel>
        )}
      </div>
    </>
  )
}

// ---------- Analytics ----------

const RANGES = [
  { value: '4', label: '4W' },
  { value: '6', label: '6W' },
]

export function AnalyticsDashboards() {
  const { plan, zones } = usePlan()
  const connected = useHasRunData()
  const units = useSettings((s) => s.units)
  const activities = useActivities()
  const [range, setRange] = useState('6')
  const [now] = useState(today)
  const acts = activities.data?.activities ?? []
  const weeks = weeklyMetrics(lastWeeks(now, Number(range)), acts, plan, zones)
  // Lundi matin, la semaine en cours est encore vide : les chiffres affichés restent ceux de la semaine passée.
  const showPast = weeks.length > 1 && !weeks.at(-1)?.runs
  const last = weeks.at(showPast ? -2 : -1)
  const prev = weeks.at(showPast ? -3 : -2)
  const delta = (a?: number, b?: number) => (a !== undefined && b ? `${Math.abs(Math.round(((a - b) / b) * 100))}%` : undefined)
  const trend = (a?: number, b?: number): Kpi['trend'] => (a === undefined || b === undefined || a === b ? 'flat' : a > b ? 'up' : 'down')

  const kpis: Kpi[] = [
    {
      id: 'km',
      label: 'Volume',
      value: `${formatNumber(Math.round((last?.km ?? 0) * 10) / 10)} km`,
      delta: delta(last?.km, prev?.km),
      trend: trend(last?.km, prev?.km),
      goodWhen: 'up',
      points: weeks.map((w) => ({ x: w.label, y: Math.round(w.km * 10) / 10 })),
      compare: plan ? weeks.map((w) => ({ x: w.label, y: Math.round(w.plannedKm * 10) / 10 })) : undefined,
      format: (v) => `${formatNumber(v)} km`,
    },
    {
      id: 'time',
      label: 'Time',
      value: formatDuration((last?.hours ?? 0) * 3600),
      delta: delta(last?.hours, prev?.hours),
      trend: trend(last?.hours, prev?.hours),
      goodWhen: 'up',
      points: weeks.map((w) => ({ x: w.label, y: Math.round(w.hours * 10) / 10 })),
      format: (v) => formatDuration(v * 3600),
    },
    {
      id: 'runs',
      label: 'Runs',
      value: String(last?.runs ?? 0),
      delta: delta(last?.runs, prev?.runs),
      trend: trend(last?.runs, prev?.runs),
      goodWhen: 'up',
      points: weeks.map((w) => ({ x: w.label, y: w.runs })),
      compare: plan ? weeks.map((w) => ({ x: w.label, y: w.plannedRuns })) : undefined,
      format: (v) => String(Math.round(v)),
    },
    {
      id: 'pace',
      label: 'Avg pace',
      value: last?.pace ? `${formatPace(last.pace, units)}` : '—',
      delta: delta(last?.pace || undefined, prev?.pace || undefined),
      trend: trend(last?.pace || undefined, prev?.pace || undefined),
      goodWhen: 'down',
      points: weeks.filter((w) => w.pace > 0).map((w) => ({ x: w.label, y: Math.round(w.pace) })),
      format: (v) => formatPace(v, units),
    },
  ]

  const longest = [...acts].sort((a, b) => (b.meters ?? 0) - (a.meters ?? 0)).slice(0, 5)
  const byType = plan
    ? (Object.keys(TYPE_META) as (keyof typeof TYPE_META)[])
        .filter((t) => t !== 'rest')
        .map((t) => ({ label: TYPE_META[t].label, value: allSessions(plan).filter((s) => s.type === t).length }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
    : []

  return (
    <div className="flex w-full flex-col gap-4">
      <MetricsDashboard
        title="Analytics"
        subtitle={showPast ? 'Last week · this week has no runs yet' : 'This week so far'}
        kpis={kpis}
        ranges={RANGES}
        range={range}
        onRangeChange={setRange}
        compareLabel="Compare to plan"
        emptyLabel={connected ? 'No runs in this period' : 'No watch connected'}
        lists={[
          {
            title: 'Longest runs',
            columnLabel: 'Distance',
            rows: longest.map((a) => ({ label: `${formatDay(a.date, { day: 'numeric', month: 'short' })} · ${a.name}`, value: a.meters ?? 0, display: formatDistance(a.meters ?? 0, units) })),
          },
          { title: 'Plan sessions', columnLabel: 'Count', rows: byType },
        ]}
        actions={
          !connected ? (
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.settings}>Connect a watch</Link>
            </Button>
          ) : undefined
        }
      />
      <WeekView />
      <ActivityLog />
    </div>
  )
}

/** Journal des 6 dernières semaines : chaque sortie COROS, la séance du plan liée, l'écart au prévu, et les séances manquées. */
function ActivityLog() {
  const { plan, zones, links, feedback } = usePlan()
  const units = useSettings((s) => s.units)
  const activities = useActivities()
  const [now] = useState(today)
  const [open, setOpen] = useState(false)
  const acts = activities.data?.activities ?? []
  const byLabel = new Map(allSessions(plan).flatMap((s) => (links[s.id]?.labelId ? [[links[s.id].labelId as string, s] as const] : [])))
  const missed = allSessions(plan).filter((s) => s.date < now && s.date >= addDays(now, -42) && isRun(s) && !isDone(s, links, feedback))
  const rows = [
    ...acts.map((a) => ({ date: a.date, activity: a, session: byLabel.get(a.labelId) })),
    ...missed.map((s) => ({ date: s.date, activity: undefined, session: s })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  if (!rows.length) return null
  const done = rows.filter((r) => r.activity).length
  const missedCount = rows.length - done
  return (
    <Panel>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 text-left transition-colors hover:bg-foreground/[0.02]">
        <PanelHeader
          title="Log"
          subtitle={`${done} run${done > 1 ? 's' : ''}${missedCount ? ` · ${missedCount} missed` : ''} `}
          className="flex-1"
        />
        <ChevronDown className={`mr-6 size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
      <div className="divide-y border-t">
        {rows.map((r, i) => {
          const target = r.session ? sessionTotals(r.session, zones) : null
          const delta = r.activity?.meters && target?.meters ? Math.round(((r.activity.meters - target.meters) / target.meters) * 100) : null
          const body = (
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-4 px-6 py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_5rem_5rem_5rem_4.5rem]">
              <span className="text-muted-foreground text-sm capitalize">{formatDay(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: r.session ? TYPE_META[r.session.type].color : 'var(--border)' }} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">{r.session?.title ?? r.activity?.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">{r.session ? TYPE_META[r.session.type].label : 'Off plan'}</span>
                </span>
              </span>
              {r.activity ? (
                <>
                  <span className="text-right text-sm tabular-nums">{r.activity.meters ? formatDistance(r.activity.meters, units) : '—'}</span>
                  <span className="hidden text-right text-muted-foreground text-sm tabular-nums sm:block">{r.activity.seconds ? formatDuration(r.activity.seconds) : '—'}</span>
                  <span className="hidden text-right text-muted-foreground text-sm tabular-nums sm:block">{r.activity.paceSecPerKm ? formatPace(r.activity.paceSecPerKm, units) : '—'}</span>
                  <span className={`hidden text-right text-xs tabular-nums sm:block ${delta === null ? 'text-muted-foreground' : Math.abs(delta) <= 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {delta === null ? '' : `${delta > 0 ? '+' : ''}${delta}%`}
                  </span>
                </>
              ) : (
                <span className="text-right text-red-400 text-sm sm:col-span-4">Missed</span>
              )}
            </div>
          )
          return r.session ? (
            <Link key={i} to={ROUTES.session(r.session.id)} className="block transition-colors hover:bg-foreground/[0.03]">
              {body}
            </Link>
          ) : (
            <div key={i}>{body}</div>
          )
        })}
      </div>
      )}
    </Panel>
  )
}

// ---------- Stratégie de course ----------

const PACE_RE = /(\d:\d{2}(?:\s*[-–]\s*\d:\d{2})?\s*\/\s*km)/g
const SEGMENT_RE = /^km\s*(\d+(?:[.,]\d+)?)\s*[-–à]\s*(\d+(?:[.,]\d+)?)\s*[:：]\s*(.+)$/i
const GOAL_RE = /^(objectif|goal|target)\s*:\s*(.+)$/i

/** Met les allures (4:15-4:20 /km) en valeur dans une phrase. */
function withPaces(text: string) {
  return text.split(PACE_RE).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap font-medium text-foreground tabular-nums">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/**
 * Stratégie de course rédigée par Josh, mise en forme : phrase d'intro, puis un segment par tronçon
 * (« km 2-5 : … ») sous forme de frise, et l'objectif final en encadré. Retombe sur le texte brut sinon.
 */
function RaceStrategy({ text }: { text: string }) {
  const parts = text
    .split(/;|\.\s+(?=[A-ZÀ-Ýa-z])|\n+/)
    .map((p) => p.trim().replace(/\.$/, ''))
    .filter(Boolean)
  const intro: string[] = []
  const segments: { from: string; to: string; text: string }[] = []
  const goals: string[] = []
  for (const p of parts) {
    const seg = p.match(SEGMENT_RE)
    const goal = p.match(GOAL_RE)
    if (seg) segments.push({ from: seg[1], to: seg[2], text: seg[3] })
    else if (goal) goals.push(goal[2])
    else if (segments.length === 0) intro.push(p)
    else segments[segments.length - 1].text += `. ${p}`
  }
  if (!segments.length) return <p className="mt-1 max-w-3xl whitespace-pre-line text-muted-foreground text-sm leading-relaxed">{withPaces(text)}</p>
  return (
    <div className="mt-2 flex max-w-3xl flex-col gap-4">
      {intro.length > 0 && <p className="text-muted-foreground text-sm leading-relaxed">{withPaces(intro.join('. ') + '.')}</p>}
      <ol className="relative flex flex-col gap-3 border-l pl-5">
        {segments.map((sg, i) => (
          <li key={i} className="relative">
            <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
            <p className="font-medium text-xs uppercase tracking-wider" style={{ color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}>
              Km {sg.from}–{sg.to}
            </p>
            <p className="mt-0.5 text-muted-foreground text-sm leading-relaxed first-letter:uppercase">{withPaces(sg.text)}</p>
          </li>
        ))}
      </ol>
      {goals.map((g, i) => (
        <p key={i} className="rounded-2xl border bg-foreground/[0.03] px-4 py-3 text-sm">
          <span className="mr-2 text-muted-foreground text-xs uppercase tracking-wider">Goal</span>
          <span className="font-medium tabular-nums">{g}</span>
        </p>
      ))}
    </div>
  )
}

const SEGMENT_COLORS = ['var(--session-easy)', 'var(--session-tempo)', 'var(--session-long)', 'var(--session-interval)']
