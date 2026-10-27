import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, ChevronRight, Moon, Star, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { ActivityRings } from '@/components/raice/activity-rings'
import { ActivityTerrain } from '@/components/raice/activity-terrain'
import { HorizonChart } from '@/components/raice/horizon-chart'
import { MetricsDashboard, type Kpi } from '@/components/raice/metrics-dashboard'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { RefreshButton, StretchRefresh } from '@/components/raice/stretch-refresh'
import { WeekPicker, type PickerDay } from '@/components/raice/week-picker'
import { TypeBadge } from '@/components/TypeBadge'
import { WorkoutChart } from '@/components/WorkoutChart'
import { Button } from '@/components/shadcn/button'
import { addDays, formatDay, mondayOf, today } from '@/lib/coach/dates'
import { distanceUnit, distanceValue, formatDistance, formatDuration, formatNumber, formatPace } from '@/lib/coach/format'
import { isRun, sessionTotals, weekMeters } from '@/lib/coach/metrics'
import { ROUTES } from '@/lib/coach/routes'
import type { Session } from '@/lib/coach/schema'
import { PHASE_LABEL, TYPE_META } from '@/lib/coach/ui'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { INTENSITY, WEEKDAY_LABELS, baselineDeviation, currentWeek, isDone, lastWeeks, planTerrain, weekDays, weekRings, weeklyMetrics } from './coach-data'

/**
 * Onglets du coach dans l'espace coureur, construits avec les panneaux Raice (style Arc) :
 * Home (séance du jour, objectif, anneaux de la semaine), Plan (semaine jour par jour, terrain du plan)
 * et Analytics (indicateurs, écart à la moyenne).
 */

const RING_COLORS = { volume: '#6c7cf5', sessions: '#f2a33a', time: '#43b581' }

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
  const { plan, zones, reviews, feedback, links } = usePlan()
  const activities = useActivities()
  const refresh = useRefresh()
  const [now] = useState(today)
  const [day, setDay] = useState(now)
  if (!plan) return null

  const week = currentWeek(plan, now)
  const review = week ? reviews[week.number] : undefined
  const toRate = allSessions(plan)
    .filter((s) => s.date <= now && s.date >= addDays(now, -3) && !feedback[s.id] && (s.type === 'strength' || links[s.id]?.labelId))
    .at(-1)
  const todays = allSessions(plan).filter((s) => s.date === now)
  const next = allSessions(plan).find((s) => s.date > now)
  const acts = activities.data?.activities ?? []
  const rings = week ? weekRings(week, zones, acts, links, feedback) : null

  return (
    <StretchRefresh onRefresh={refresh}>
      <div className="flex w-full flex-col gap-4">
        <header className="flex items-end justify-between gap-4 pb-2">
          <div>
            <p className="text-muted-foreground text-sm capitalize">{formatDay(now)}</p>
            <h1 className="font-heading font-medium text-2xl tracking-tight">Aujourd’hui</h1>
          </div>
          <RefreshAction onRefresh={refresh} />
        </header>

        {(review?.status === 'pending' || toRate) && (
          <div className="grid gap-4 md:grid-cols-2">
            {review?.status === 'pending' && (
              <Notice to={ROUTES.adjust} icon={<Wand2 />} title="Ton bilan de la semaine est prêt">
                {review.adjustment.changes.length > 0 ? `${review.adjustment.changes.length} ajustement(s) proposé(s)` : 'Rien à changer, consulte l’analyse'}
              </Notice>
            )}
            {toRate && (
              <Notice to={`${ROUTES.session(toRate.id)}#ressenti`} icon={<Star />} title="Comment s’est passée ta séance ?">
                {toRate.title} · {formatDay(toRate.date, { weekday: 'long' })}
              </Notice>
            )}
          </div>
        )}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Séance du jour" subtitle={todays.length ? `${todays.length} séance${todays.length > 1 ? 's' : ''} prévue${todays.length > 1 ? 's' : ''}` : 'Repos'} />
            {todays.length ? (
              todays.map((s, i) => <TodaySession key={s.id} session={s} divided={i > 0} />)
            ) : (
              <PanelSection className="flex items-center gap-4">
                <span className="flex size-12 items-center justify-center rounded-2xl border">
                  <Moon className="size-5 text-muted-foreground" />
                </span>
                <div>
                  <p className="font-medium">Jour de repos</p>
                  <p className="text-muted-foreground text-sm">La récupération fait partie de l’entraînement.</p>
                </div>
              </PanelSection>
            )}
            {next && (
              <PanelFooter>
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">Prochaine séance · {formatDay(next.date, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                  <p className="truncate font-medium text-sm">{next.title}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={ROUTES.session(next.id)}>
                    Voir <ArrowRight />
                  </Link>
                </Button>
              </PanelFooter>
            )}
          </Panel>
          <GoalPanel />
        </div>

        {week && rings && (
          <Panel>
            <PanelHeader
              title={`Semaine ${week.number} · ${PHASE_LABEL[week.phase]}`}
              subtitle={week.focus}
              actions={
                <Button asChild variant="outline" size="sm">
                  <Link to={ROUTES.adjust}>
                    <Wand2 /> Ajuster ma semaine
                  </Link>
                </Button>
              }
            />
            <PanelSection divided>
              <ActivityRings
                rings={[
                  { id: 'volume', label: 'Volume', detail: `${formatDistance(rings.volume.done)} / ${formatDistance(rings.volume.planned, 'metric', 0)}`, value: rings.volume.value, color: RING_COLORS.volume },
                  { id: 'sessions', label: 'Séances', detail: `${rings.sessions.done} / ${rings.sessions.planned} faites`, value: rings.sessions.value, color: RING_COLORS.sessions },
                  { id: 'time', label: 'Temps', detail: `${formatDuration(rings.time.done)} / ${formatDuration(rings.time.planned)}`, value: rings.time.value, color: RING_COLORS.time },
                ]}
                centerCaption="de la semaine"
                days={rings.perDay.map((d, i) => ({ key: d.key, label: WEEKDAY_LABELS[i], values: d.values, isToday: d.key === now }))}
                selectedDay={day}
                onSelectDay={setDay}
              />
            </PanelSection>
          </Panel>
        )}
      </div>
    </StretchRefresh>
  )
}

function Notice({ to, icon, title, children }: { to: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-[24px] border bg-card px-5 py-4 transition-colors hover:border-foreground/30">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border [&>svg]:size-4.5">{icon}</span>
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
  return (
    <PanelSection divided className="flex flex-col gap-5" data-divided={divided}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <TypeBadge type={session.type} />
          <h3 className="mt-2 font-heading font-medium text-2xl tracking-tight">{session.title}</h3>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{session.description}</p>
        </div>
        <Button asChild>
          <Link to={ROUTES.session(session.id)}>
            Voir la séance <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 divide-x rounded-2xl border">
        <Stat label="Durée" value={formatDuration(seconds)} />
        <Stat label="Distance" value={meters > 0 ? formatDistance(meters, units) : '—'} />
        <Stat label="Allure moyenne" value={pace > 0 ? `${formatPace(pace, units)}` : '—'} />
      </div>
      {session.blocks.length > 0 && <WorkoutChart blocks={session.blocks} zones={zones} className="h-14" />}
    </PanelSection>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 font-medium text-xl tabular-nums tracking-tight">{value}</p>
    </div>
  )
}

function GoalPanel() {
  const { plan, goal } = usePlan()
  const [now] = useState(today)
  if (!plan) return null
  const daysLeft = Math.max(0, Math.round((Date.parse(plan.raceDate) - Date.parse(now)) / 86_400_000))
  const current = currentWeek(plan, now)?.number ?? (now > plan.raceDate ? plan.weeks.length : 0)
  const pct = Math.round((current / plan.weeks.length) * 100)
  return (
    <Panel>
      <PanelHeader
        title="Objectif"
        subtitle={formatDay(plan.raceDate, { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <Link to={ROUTES.goal} className="text-muted-foreground text-sm hover:text-foreground">
            Modifier
          </Link>
        }
      />
      <PanelSection className="pt-0">
        <p className="font-heading font-medium text-xl leading-snug tracking-tight">{plan.name}</p>
      </PanelSection>
      <div className="grid grid-cols-2 divide-x border-t">
        <div className="px-6 py-5">
          <p className="text-muted-foreground text-xs">Jour J</p>
          <p className="mt-1 font-medium text-4xl tabular-nums tracking-tight">{daysLeft === 0 ? 'J' : `J-${daysLeft}`}</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-muted-foreground text-xs">Temps visé</p>
          <p className="mt-1 font-medium text-4xl tabular-nums tracking-tight">{goal?.targetTime ? formatDuration(goal.targetTime) : '—'}</p>
        </div>
      </div>
      <PanelFooter>
        <div className="flex w-full flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Semaine {current} sur {plan.weeks.length}
            </span>
            <span className="tabular-nums">{pct} %</span>
          </div>
          <div className="flex gap-1">
            {plan.weeks.map((w) => (
              <span key={w.number} className={`h-1.5 flex-1 rounded-full ${w.number <= current ? 'bg-foreground' : 'bg-foreground/15'}`} />
            ))}
          </div>
        </div>
      </PanelFooter>
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
      caption: sessions.length === 0 ? 'Repos' : allDone ? 'Fait ✓' : `${sessions.length} séance${sessions.length > 1 ? 's' : ''}`,
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
    <StretchRefresh onRefresh={refresh}>
      <div className="flex w-full flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
          <div>
            <p className="text-muted-foreground text-sm">
              {plan.weeks.length} semaines · course le {formatDay(plan.raceDate, { day: 'numeric', month: 'long' })}
            </p>
            <h1 className="font-heading font-medium text-2xl tracking-tight">{plan.name}</h1>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.goal}>Objectif</Link>
          </Button>
        </header>

        <WeekPicker
          title={`Semaine ${week.number} · ${PHASE_LABEL[week.phase]}`}
          subtitle={`${formatDistance(volumes[week.number - 1], units, 0)} prévus · ${week.sessions.length} séance${week.sessions.length > 1 ? 's' : ''} · ${week.focus}`}
          actions={
            <>
              <Button variant="outline" size="icon" aria-label="Semaine précédente" disabled={week.number <= 1} onClick={() => goWeek(week.number - 1)}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" aria-label="Semaine suivante" disabled={week.number >= plan.weeks.length} onClick={() => goWeek(week.number + 1)}>
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
          footerCaption={week.number === current ? 'Cette semaine' : week.number < current ? 'Semaine passée' : 'À venir'}
          footerSummary={`${week.sessions.filter((s) => isDone(s, links, feedback)).length} / ${week.sessions.length} séances faites · ${formatDistance(volumes[week.number - 1], units, 0)} prévus`}
          footerAction={
            week.number === current ? (
              <Button asChild>
                <Link to={ROUTES.adjust}>
                  <Wand2 /> Ajuster ma semaine
                </Link>
              </Button>
            ) : undefined
          }
        />

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel>
            <PanelHeader title="Volume du plan" subtitle="Kilomètres prévus semaine par semaine" />
            <PanelSection divided>
              <BarChart
                data={plan.weeks.map((w, i) => ({ key: String(w.number), label: `Semaine ${w.number}`, axisLabel: `S${w.number}`, value: distanceValue(volumes[i], units) }))}
                label="Volume prévu"
                period={`${plan.weeks.length} semaines`}
                unit={distanceUnit(units)}
                averageLabel="Moyenne par semaine"
                valueLabel="Volume prévu"
                categoryLabel="Semaine"
                showAverage={false}
                height={200}
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
                    S{w.number}
                  </button>
                ))}
              </div>
            </PanelSection>
            {(goal?.course || plan.raceStrategy) && (
              <PanelFooter>
                <p className="text-muted-foreground text-sm">{plan.raceStrategy ?? `${goal?.course?.distanceKm} km · ${goal?.course?.gain} m D+`}</p>
              </PanelFooter>
            )}
          </Panel>

          <ActivityTerrain
            title="La forme de ton plan"
            subtitle={`Chaque jour de chaque semaine, de S1 à S${plan.weeks.length}`}
            rowLabels={terrain.rowLabels}
            colLabels={terrain.colLabels}
            metrics={[
              { id: 'distance', label: 'Distance', values: terrain.distance, format: fmtKm },
              { id: 'duration', label: 'Durée', values: terrain.duration, format: fmtMin },
              { id: 'intensity', label: 'Intensité', values: terrain.intensity, format: (v) => (v === 0 ? 'Repos' : ['', 'Facile', 'Modérée', 'Dure'][Math.min(3, Math.round(v))] ?? 'Dure') },
            ]}
            stats={[
              { label: 'Volume total', value: fmtKm(Math.round(volumes.reduce((a, v) => a + v, 0) / 1000)), detail: `${allSessions(plan).length} séances` },
              {
                label: 'Plus grosses semaines',
                value: '',
                list: plan.weeks
                  .map((w, i) => ({ label: `Semaine ${w.number}`, km: volumes[i] }))
                  .sort((a, b) => b.km - a.km)
                  .slice(0, 3)
                  .map((w) => ({ label: w.label, value: formatDistance(w.km, units, 0) })),
              },
              { label: 'Jour de sortie longue', value: goal ? ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][goal.longRunDay] : '—' },
            ]}
            hint="Survole une barre pour le détail."
          />
        </div>
      </div>
    </StretchRefresh>
  )
}

// ---------- Analytics ----------

const RANGES = [
  { value: '4', label: '4S' },
  { value: '6', label: '6S' },
]

export function AnalyticsDashboards() {
  const { plan, zones } = usePlan()
  const connected = useCorosAuth((s) => s.connected)
  const units = useSettings((s) => s.units)
  const activities = useActivities()
  const [range, setRange] = useState('6')
  const [now] = useState(today)
  const acts = activities.data?.activities ?? []
  const weeks = weeklyMetrics(lastWeeks(now, Number(range)), acts, plan, zones)
  const last = weeks.at(-1)
  const prev = weeks.at(-2)
  const delta = (a?: number, b?: number) => (a !== undefined && b ? `${Math.abs(Math.round(((a - b) / b) * 100))} %` : undefined)
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
      label: 'Temps',
      value: formatDuration((last?.hours ?? 0) * 3600),
      delta: delta(last?.hours, prev?.hours),
      trend: trend(last?.hours, prev?.hours),
      goodWhen: 'up',
      points: weeks.map((w) => ({ x: w.label, y: Math.round(w.hours * 10) / 10 })),
      format: (v) => formatDuration(v * 3600),
    },
    {
      id: 'runs',
      label: 'Sorties',
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
      label: 'Allure moyenne',
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
  const horizon = baselineDeviation(acts, now)

  return (
    <div className="flex w-full flex-col gap-4">
      <MetricsDashboard
        title="Analytics"
        subtitle={connected ? `Tes ${range} dernières semaines, depuis COROS` : 'Connecte COROS pour suivre tes sorties'}
        kpis={kpis}
        ranges={RANGES}
        range={range}
        onRangeChange={setRange}
        compareLabel="Comparer au plan"
        emptyLabel={connected ? 'Aucune sortie sur la période' : 'COROS n’est pas connecté'}
        lists={[
          {
            title: 'Plus longues sorties',
            columnLabel: 'Distance',
            rows: longest.map((a) => ({ label: `${formatDay(a.date, { day: 'numeric', month: 'short' })} · ${a.name}`, value: a.meters ?? 0, display: formatDistance(a.meters ?? 0, units) })),
          },
          { title: 'Séances du plan', columnLabel: 'Nombre', rows: byType },
        ]}
        actions={
          !connected ? (
            <Button asChild variant="outline" size="sm">
              <Link to={ROUTES.settings}>Connecter COROS</Link>
            </Button>
          ) : undefined
        }
      />
      {acts.length > 0 && (
        <HorizonChart
          title="Par rapport à ta moyenne"
          subtitle="Volume, durée, sorties et allure sur 7 jours glissants, comparés à tes 6 dernières semaines"
          series={horizon.series}
          pointLabels={horizon.pointLabels}
          defaultBands={3}
          format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} %`}
        />
      )}
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
  const acts = activities.data?.activities ?? []
  const byLabel = new Map(allSessions(plan).flatMap((s) => (links[s.id]?.labelId ? [[links[s.id].labelId as string, s] as const] : [])))
  const missed = allSessions(plan).filter((s) => s.date < now && s.date >= addDays(now, -42) && isRun(s) && !isDone(s, links, feedback))
  const rows = [
    ...acts.map((a) => ({ date: a.date, activity: a, session: byLabel.get(a.labelId) })),
    ...missed.map((s) => ({ date: s.date, activity: undefined, session: s })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  if (!rows.length) return null
  return (
    <Panel>
      <PanelHeader title="Journal" subtitle="Tes sorties des 6 dernières semaines, comparées au plan" />
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
                  <span className="block truncate text-muted-foreground text-xs">{r.session ? TYPE_META[r.session.type].label : 'Hors plan'}</span>
                </span>
              </span>
              {r.activity ? (
                <>
                  <span className="text-right text-sm tabular-nums">{r.activity.meters ? formatDistance(r.activity.meters, units) : '—'}</span>
                  <span className="hidden text-right text-muted-foreground text-sm tabular-nums sm:block">{r.activity.seconds ? formatDuration(r.activity.seconds) : '—'}</span>
                  <span className="hidden text-right text-muted-foreground text-sm tabular-nums sm:block">{r.activity.paceSecPerKm ? formatPace(r.activity.paceSecPerKm, units) : '—'}</span>
                  <span className={`hidden text-right text-xs tabular-nums sm:block ${delta === null ? 'text-muted-foreground' : Math.abs(delta) <= 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {delta === null ? '' : `${delta > 0 ? '+' : ''}${delta} %`}
                  </span>
                </>
              ) : (
                <span className="text-right text-red-400 text-sm sm:col-span-4">Non réalisée</span>
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
    </Panel>
  )
}
