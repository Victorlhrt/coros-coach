import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Moon, Star, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { ActivityTerrain } from '@/components/raice/activity-terrain'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { RefreshButton } from '@/components/raice/stretch-refresh'
import { WeekPicker, type PickerDay } from '@/components/raice/week-picker'
import { TypeBadge } from '@/components/TypeBadge'
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
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { INTENSITY, WEEKDAY_LABELS, currentWeek, isDone, planTerrain, weekDays, weekRings } from './coach-data'

/**
 * Onglets du coach dans l'espace coureur, construits avec les panneaux Raice (style Arc) :
 * Home (séance du jour, objectif, anneaux de la semaine) et Plan (semaine jour par jour, terrain du plan).
 */

const RING_COLORS = { volume: '#6c7cf5', sessions: '#f2a33a', time: '#43b581' }
/** Couleur de chaque phase du plan (barre de progression de l'objectif). */
const PHASE_COLORS = { base: 'var(--session-easy)', build: 'var(--session-long)', peak: 'var(--session-interval)', taper: 'var(--session-recovery)', race: 'var(--session-race)' } as const

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

        {(review?.status === 'pending' || toRate) && (
          <div className="grid gap-4 md:grid-cols-2">
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

/**
 * La semaine en cours : trois jauges colorées (volume, séances, temps) puis les 7 jours en tuiles
 * teintées de la couleur de la séance ; un clic sur un jour affiche ses séances dessous.
 */
function ThisWeek({ week, now }: { week: Week; now: string }) {
  const { zones, links, feedback } = usePlan()
  const units = useSettings((s) => s.units)
  const activities = useActivities()
  const navigate = useNavigate()
  const days = weekDays(week)
  const [selected, setSelected] = useState(days.includes(now) ? now : days[0])
  const rings = weekRings(week, zones, activities.data?.activities ?? [], links, feedback)
  const daySessions = week.sessions.filter((s) => s.date === selected)
  const meters = [
    { label: 'Volume', value: rings.volume.value, detail: `${formatDistance(rings.volume.done, units)} of ${formatDistance(rings.volume.planned, units, 0)}`, color: RING_COLORS.volume },
    { label: 'Sessions', value: rings.sessions.value, detail: `${rings.sessions.done} of ${rings.sessions.planned} done`, color: RING_COLORS.sessions },
    { label: 'Time', value: rings.time.value, detail: `${formatDuration(rings.time.done)} of ${formatDuration(rings.time.planned)}`, color: RING_COLORS.time },
  ]
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
      <div className="grid grid-cols-3 divide-x border-t">
        {meters.map((m) => (
          <div key={m.label} className="flex flex-col gap-2 px-4 py-4 sm:px-6">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-muted-foreground text-xs">{m.label}</p>
              <p className="font-medium text-lg tabular-nums tracking-tight" style={{ color: m.color }}>
                {Math.round(m.value * 100)}%
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, m.value * 100)}%`, background: m.color }} />
            </div>
            <p className="hidden truncate text-muted-foreground text-xs tabular-nums sm:block">{m.detail}</p>
          </div>
        ))}
      </div>
      <PanelSection divided>
        <div className="no-scrollbar -mx-6 -my-1 flex gap-2 overflow-x-auto px-6 py-1 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0">
          {days.map((d, i) => {
            const sessions = week.sessions.filter((s) => s.date === d)
            const main = sessions[0]
            const color = main ? TYPE_META[main.type].color : undefined
            const done = sessions.length > 0 && sessions.every((s) => isDone(s, links, feedback))
            const isSel = d === selected
            return (
              <button
                key={d}
                type="button"
                aria-pressed={isSel}
                onClick={() => setSelected(d)}
                className={`relative flex min-h-28 w-24 shrink-0 flex-col rounded-2xl border p-3 text-left transition-colors sm:w-auto ${isSel ? 'ring-2 ring-foreground/60' : 'hover:border-foreground/30'} ${!main ? 'border-dashed' : ''}`}
                style={color ? { background: `color-mix(in srgb, ${color} 13%, transparent)`, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` } : undefined}
              >
                <span className="flex items-center justify-between text-xs">
                  <span className={d === now ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                    {WEEKDAY_LABELS[i]} {Number(d.slice(8))}
                  </span>
                  {done && <Check className="size-3.5 text-emerald-400" aria-label="Done" />}
                </span>
                {main ? (
                  <span className="mt-auto">
                    <span className="block truncate font-medium text-xs" style={{ color }}>
                      {TYPE_META[main.type].label}
                    </span>
                    <span className="block font-medium text-sm tabular-nums">
                      {(() => {
                        const t = sessionTotals(main, zones)
                        return t.meters > 0 ? formatDistance(t.meters, units) : formatDuration(t.seconds)
                      })()}
                    </span>
                  </span>
                ) : (
                  <span className="mt-auto text-muted-foreground text-xs">Rest</span>
                )}
                {d === now && <span aria-hidden className="absolute top-3 right-3 size-1.5 rounded-full bg-foreground" style={done ? { display: 'none' } : undefined} />}
              </button>
            )
          })}
        </div>
        <div className="mt-4">
          {daySessions.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {daySessions.map((s) => {
                const t = sessionTotals(s, zones)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => navigate(ROUTES.session(s.id))}
                    className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04]"
                  >
                    <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: TYPE_META[s.type].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">{s.title}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {formatDay(s.date, { weekday: 'long', day: 'numeric', month: 'short' })} · {formatDuration(t.seconds)}
                        {t.meters > 0 ? ` · ${formatDistance(t.meters, units)}` : ''}
                      </span>
                    </span>
                    {isDone(s, links, feedback) ? <Check className="size-4 text-emerald-400" aria-label="Done" /> : <ArrowRight className="size-4 text-muted-foreground" />}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed px-4 py-3 text-muted-foreground text-sm">
              <span className="font-medium text-foreground">{formatDay(selected, { weekday: 'long' })}</span> · Rest day. Recovery is part of training.
            </p>
          )}
        </div>
      </PanelSection>
    </Panel>
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
  const [now] = useState(today)
  if (!plan) return null
  const daysLeft = Math.max(0, Math.round((Date.parse(plan.raceDate) - Date.parse(now)) / 86_400_000))
  const current = currentWeek(plan, now)?.number ?? (now > plan.raceDate ? plan.weeks.length : 0)
  const pct = Math.round((current / plan.weeks.length) * 100)
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Goal"
        subtitle={formatDay(plan.raceDate, { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <Link to={ROUTES.goal} className="text-muted-foreground text-sm hover:text-foreground">
            Edit
          </Link>
        }
      />
      <PanelSection className="pt-0">
        <p className="font-heading font-medium text-xl leading-snug tracking-tight">{plan.name}</p>
      </PanelSection>
      <div className="grid flex-1 grid-cols-2 items-center divide-x border-t">
        <div className="px-6 py-5">
          <p className="text-muted-foreground text-xs">Race day</p>
          <p className="mt-1 whitespace-nowrap font-medium text-3xl tabular-nums tracking-tight sm:text-4xl" style={{ color: 'var(--session-race)' }}>
            {daysLeft === 0 ? 'Today' : `D-${daysLeft}`}
          </p>
        </div>
        <div className="px-6 py-5">
          <p className="text-muted-foreground text-xs">Target time</p>
          <p className="mt-1 whitespace-nowrap font-medium text-3xl tabular-nums tracking-tight sm:text-4xl">{goal?.targetTime ? formatDuration(goal.targetTime) : '—'}</p>
        </div>
      </div>
      <PanelFooter>
        <div className="flex w-full flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Week {current} of {plan.weeks.length}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="flex gap-1">
            {plan.weeks.map((w) => (
              <span
                key={w.number}
                title={`Week ${w.number} · ${PHASE_LABEL[w.phase]}`}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: w.number <= current ? PHASE_COLORS[w.phase] : `color-mix(in srgb, ${PHASE_COLORS[w.phase]} 22%, transparent)` }}
              />
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
          subtitle={`${PHASE_LABEL[week.phase]} · ${formatDistance(volumes[week.number - 1], units, 0)} planned · ${week.sessions.length} session${week.sessions.length > 1 ? 's' : ''}`}
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
          footerAction={
            week.number === current ? (
              <Button asChild>
                <Link to={ROUTES.adjust}>
                  <Wand2 /> Adjust my week
                </Link>
              </Button>
            ) : undefined
          }
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
                  <p className="font-medium text-sm">Pacer</p>
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
 * Stratégie de course rédigée par Pacer, mise en forme : phrase d'intro, puis un segment par tronçon
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
