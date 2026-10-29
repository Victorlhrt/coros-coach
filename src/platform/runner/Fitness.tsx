import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, type Kpi } from '@/components/raice/metrics-dashboard'
import { Panel, PanelHeader, Segmented } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { addDays, formatDay, today } from '@/lib/coach/dates'
import { formatClock, formatNumber, formatPace, paceUnit } from '@/lib/coach/format'
import { ROUTES } from '@/lib/coach/routes'
import { DISTANCES } from '@/lib/coach/schema'
import { RECORD_DISTANCES, predictTime, thresholdPace, vdot } from '@/lib/coach/vdot'
import { normalizeActivities, type Activity } from '@/lib/coros/activities'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { fetchRunRecords } from '@/lib/coros/data'
import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { cn } from '@/lib/utils'
import { lastWeeks } from './coach-data'

/**
 * Analytics › Fitness : les indicateurs qui prédisent la course (VO2max estimée, chrono prédit, allure seuil,
 * allure et FC moyennes, efficacité aérobie, charge). Une ligne par indicateur ; on la déplie pour voir sa courbe.
 */

const RANGES = [
  { value: '8', label: '8W' },
  { value: '16', label: '16W' },
]
const GOAL_METERS: Record<keyof typeof DISTANCES, number> = { '5k': 5000, '10k': 10000, half: 21097.5, marathon: 42195, trail: 0 }

/** 16 semaines d'activités : plus long que l'onglet Runs, pour voir la forme évoluer. */
function useLongActivities() {
  const connected = useCorosAuth((s) => s.connected)
  return useQuery({
    queryKey: ['coros', 'activities', 112],
    queryFn: async () => normalizeActivities(await fetchRunRecords(112)),
    enabled: connected,
    staleTime: 10 * 60 * 1000,
  })
}

/** VDOT d'une sortie, seulement si elle est assez longue pour être parlante (≥ 3 km et ≥ 12 min). */
function runVdot(a: Activity) {
  if (!a.meters || !a.seconds || a.meters < 3000 || a.seconds < 720) return null
  const v = vdot(a.meters, a.seconds)
  return Number.isFinite(v) && v > 15 && v < 90 ? v : null
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const round1 = (v: number) => Math.round(v * 10) / 10

function weeklyFitness(starts: string[], acts: Activity[]) {
  return starts.map((start) => {
    const end = addDays(start, 6)
    const week = acts.filter((a) => a.date >= start && a.date <= end)
    const vdots = week.map(runVdot).filter((v): v is number => v !== null)
    const paced = week.filter((a) => a.meters && a.seconds)
    const meters = sum(paced.map((a) => a.meters ?? 0))
    const seconds = sum(paced.map((a) => a.seconds ?? 0))
    const hr = week.filter((a) => a.avgHr && a.seconds)
    const hrSeconds = sum(hr.map((a) => a.seconds ?? 0))
    const avgHr = hrSeconds ? sum(hr.map((a) => (a.avgHr ?? 0) * (a.seconds ?? 0))) / hrSeconds : 0
    // Mètres parcourus par battement : plus c'est haut, plus le moteur aérobie est efficace.
    const hrMeters = sum(hr.map((a) => a.meters ?? 0))
    const efficiency = hrSeconds && avgHr ? hrMeters / ((hrSeconds / 60) * avgHr) : 0
    return {
      start,
      label: formatDay(start, { day: 'numeric', month: 'short' }),
      vdot: vdots.length ? Math.max(...vdots) : 0,
      km: sum(week.map((a) => a.meters ?? 0)) / 1000,
      pace: meters ? seconds / (meters / 1000) : 0,
      hr: avgHr,
      efficiency,
    }
  })
}

type Row = Kpi & { hint: string; extra?: React.ReactNode }

export function FitnessDashboard() {
  const connected = useCorosAuth((s) => s.connected)
  const units = useSettings((s) => s.units)
  const goal = usePlan((s) => s.goal)
  const records = usePlan((s) => s.records)
  const activities = useLongActivities()
  const [range, setRange] = useState('16')
  const [open, setOpen] = useState('vo2')
  const [now] = useState(today)
  const acts = activities.data ?? []
  const weeks = weeklyFitness(lastWeeks(now, Number(range)), acts)

  // VO2max actuelle : meilleure sortie des 4 dernières semaines, ou les records si c'est mieux.
  const recent = weeks.slice(-4).map((w) => w.vdot).filter(Boolean)
  const fromRecords = records
    .filter((r) => !r.date || r.date >= addDays(now, -120))
    .map((r) => vdot(RECORD_DISTANCES.find((d) => d.key === r.key)!.meters, r.seconds))
  const current = Math.max(0, ...recent, ...fromRecords)
  const before = weeks.slice(0, 4).map((w) => w.vdot).filter(Boolean)
  const past = before.length ? Math.max(...before) : 0
  // VDOT courante semaine par semaine : meilleure valeur des 4 semaines glissantes, pour lisser les semaines sans effort.
  const rolling = weeks.map((w, i) => ({ x: w.label, y: round1(Math.max(0, ...weeks.slice(Math.max(0, i - 3), i + 1).map((x) => x.vdot))) })).filter((p) => p.y > 0)

  const goalMeters = goal ? (goal.distance === 'trail' ? (goal.courseKm ?? 0) * 1000 : GOAL_METERS[goal.distance]) : 0
  const predictMeters = goalMeters || 10000
  const predictLabel = goalMeters ? (goal?.distance === 'trail' ? `${formatNumber(goalMeters / 1000)} km` : DISTANCES[goal!.distance]) : '10 km'

  const pct = (a: number, b: number) => (a && b ? `${Math.abs(Math.round(((a - b) / b) * 1000) / 10)}%` : undefined)
  const trend = (a: number, b: number): Kpi['trend'] => (!a || !b || Math.abs(a - b) < 1e-6 ? 'flat' : a > b ? 'up' : 'down')
  const series = (f: (w: (typeof weeks)[number]) => number, digits = 1) =>
    weeks.filter((w) => f(w) > 0).map((w) => ({ x: w.label, y: Math.round(f(w) * 10 ** digits) / 10 ** digits }))
  const firstLast = (pts: { y: number }[]) => [pts.at(-1)?.y ?? 0, pts[0]?.y ?? 0] as const

  const pacePts = series((w) => w.pace, 0)
  const hrPts = series((w) => w.hr, 0)
  const effPts = series((w) => w.efficiency, 2)
  const [paceNow, paceThen] = firstLast(pacePts)
  const [hrNow, hrThen] = firstLast(hrPts)
  const [effNow, effThen] = firstLast(effPts)
  const predicted = current ? predictTime(current, predictMeters) : 0
  const predictedPast = past ? predictTime(past, predictMeters) : 0

  // Charge : semaine en cours rapportée à la moyenne des 4 précédentes (zone sûre 0.8–1.3).
  const lastKm = weeks.at(-1)?.km ?? 0
  const chronic = weeks.slice(-5, -1)
  const chronicKm = chronic.length ? sum(chronic.map((w) => w.km)) / chronic.length : 0
  const acwr = chronicKm ? lastKm / chronicKm : 0
  const loadPts = weeks.map((w, i) => {
    const prev = weeks.slice(Math.max(0, i - 4), i)
    const base = prev.length ? sum(prev.map((x) => x.km)) / prev.length : 0
    return { x: w.label, y: base ? Math.round((w.km / base) * 100) / 100 : 0 }
  }).filter((p, i) => i >= 1 && p.y > 0)

  const rows: Row[] = [
    {
      id: 'vo2',
      label: 'Estimated VO2max',
      value: current ? formatNumber(round1(current)) : '—',
      unit: current ? 'ml/kg/min' : undefined,
      delta: pct(current, past),
      trend: trend(current, past),
      hint: 'VDOT from your best effort of the last 4 weeks (or your records)',
      points: rolling,
      format: (v) => formatNumber(v),
    },
    {
      id: 'predict',
      label: `Predicted ${predictLabel}`,
      value: predicted ? formatClock(predicted) : '—',
      delta: pct(predicted, predictedPast),
      trend: trend(predicted, predictedPast),
      goodWhen: 'down',
      hint: goal?.distance === 'trail' ? 'Flat-equivalent time from your VO2max, elevation not included' : 'What your current VO2max is worth on race day',
      points: rolling.map((p) => ({ x: p.x, y: predictTime(p.y, predictMeters) })),
      format: (v) => formatClock(v),
      extra: current ? (
        <div className="grid grid-cols-4 gap-4">
          {RECORD_DISTANCES.map((d) => (
            <div key={d.key}>
              <p className="text-muted-foreground text-xs">{d.label}</p>
              <p className="font-medium text-sm tabular-nums">{formatClock(predictTime(current, d.meters))}</p>
            </div>
          ))}
        </div>
      ) : undefined,
    },
    {
      id: 'threshold',
      label: 'Threshold pace',
      value: current ? formatPace(thresholdPace(current), units) : '—',
      unit: current ? paceUnit(units) : undefined,
      delta: pct(current ? thresholdPace(current) : 0, past ? thresholdPace(past) : 0),
      trend: trend(current ? thresholdPace(current) : 0, past ? thresholdPace(past) : 0),
      goodWhen: 'down',
      hint: 'The pace you can hold for about an hour, from your VO2max',
      points: rolling.map((p) => ({ x: p.x, y: thresholdPace(p.y) })),
      format: (v) => formatPace(v, units),
    },
    {
      id: 'pace',
      label: 'Average pace',
      value: paceNow ? formatPace(paceNow, units) : '—',
      unit: paceNow ? paceUnit(units) : undefined,
      delta: pct(paceNow, paceThen),
      trend: trend(paceNow, paceThen),
      goodWhen: 'down',
      hint: 'All runs of the week, weighted by distance',
      points: pacePts,
      format: (v) => formatPace(v, units),
    },
    {
      id: 'hr',
      label: 'Average heart rate',
      value: hrNow ? String(Math.round(hrNow)) : '—',
      unit: hrNow ? 'bpm' : undefined,
      delta: pct(hrNow, hrThen),
      trend: trend(hrNow, hrThen),
      goodWhen: 'down',
      hint: 'All runs of the week, weighted by duration',
      points: hrPts,
      format: (v) => `${Math.round(v)} bpm`,
    },
    {
      id: 'efficiency',
      label: 'Aerobic efficiency',
      value: effNow ? effNow.toFixed(2) : '—',
      unit: effNow ? 'm/beat' : undefined,
      delta: pct(effNow, effThen),
      trend: trend(effNow, effThen),
      hint: 'Metres covered per heartbeat: it rises as your aerobic engine grows',
      points: effPts,
      format: (v) => v.toFixed(2),
    },
    {
      id: 'load',
      label: 'Training load',
      value: acwr ? acwr.toFixed(2) : '—',
      unit: acwr ? (acwr > 1.3 ? 'high' : acwr < 0.8 ? 'low' : 'balanced') : undefined,
      trend: 'flat',
      hint: 'This week’s volume vs. your 4-week average. 0.8–1.3 is the safe zone',
      points: loadPts,
      format: (v) => v.toFixed(2),
    },
  ]

  return (
    <Panel>
      <PanelHeader
        title="Fitness"
        actions={
          <>
            <Segmented value={range} options={RANGES} onChange={setRange} label="Period" />
            {!connected && (
              <Button asChild variant="outline" size="sm">
                <Link to={ROUTES.settings}>Connect COROS</Link>
              </Button>
            )}
          </>
        }
      />
      {(() => {
        const empty = connected ? 'Not enough runs in this period' : 'COROS isn’t connected'
        const active = rows.find((r) => r.id === open) ?? rows[0]
        const span: Record<string, string> = { vo2: 'col-span-2', predict: 'col-span-2', load: 'col-span-2 lg:col-span-1' }
        return (
          <div className="grid grid-cols-2 gap-3 border-t p-4 sm:p-6 lg:grid-cols-4">
            {rows.map((r) => (
              <MetricTile key={r.id} row={r} active={active.id === r.id} big={r.id === 'vo2' || r.id === 'predict'} className={span[r.id]} onSelect={() => setOpen(r.id)} />
            ))}
            <div className="col-span-2 flex min-w-0 flex-col gap-3 rounded-[20px] border p-4 lg:col-span-3">
              <p className="font-medium text-sm">{active.label}</p>
              <LineChart kpi={active} showCompare={false} emptyLabel={empty} />
            </div>
          </div>
        )
      })()}
    </Panel>
  )
}

/** Tuile du bento : indicateur, valeur, variation et petite courbe ; la tuile choisie s'ouvre en grand dans le graphique. */
function MetricTile({ row, active, big, className, onSelect }: { row: Row; active: boolean; big?: boolean; className?: string; onSelect: () => void }) {
  const t = row.trend ?? 'flat'
  const good = t !== 'flat' && t === (row.goodWhen ?? 'up')
  const tone = t === 'flat' ? 'text-muted-foreground' : good ? 'text-emerald-400' : 'text-red-400'
  const Icon = t === 'up' ? ArrowUpRight : t === 'down' ? ArrowDownRight : Minus
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      title={row.hint}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-[20px] border p-4 text-left transition-colors',
        active ? 'border-foreground/40 bg-foreground/[0.04]' : 'hover:border-foreground/20 hover:bg-foreground/[0.02]',
        className,
      )}
    >
      <p className="truncate text-muted-foreground text-sm">{row.label}</p>
      <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', !big && 'flex-col items-start')}>
        <div className="min-w-0">
          <p className={cn('font-medium tabular-nums tracking-tight', big ? 'text-4xl' : 'text-2xl')}>
            {row.value}
            {row.unit && <span className="ml-1 font-normal text-muted-foreground text-xs">{row.unit}</span>}
          </p>
          {row.delta ? (
            <p className={cn('mt-1 inline-flex items-center gap-1 text-xs tabular-nums', tone)}>
              <Icon className="size-3" aria-hidden />
              {row.delta}
            </p>
          ) : (
            <p className="mt-1 h-4" />
          )}
        </div>
        {big && row.extra}
      </div>
      <Spark points={row.points.map((p) => p.y)} invert={row.goodWhen === 'down'} className={cn('mt-auto', big ? 'h-12' : 'h-9')} />
    </button>
  )
}

/** Petite courbe sans axes ; le point final marque la dernière valeur. `invert` met « mieux » en haut (allures, chronos). */
function Spark({ points, invert, className }: { points: number[]; invert?: boolean; className?: string }) {
  if (points.length < 2) return <div className={cn('w-full rounded-full border-t border-dashed opacity-40', className)} />
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  const xy = points.map((v, i) => {
    const n = (v - lo) / span
    return [(i / (points.length - 1)) * 100, (invert ? n : 1 - n) * 90 + 5] as const
  })
  const [lx, ly] = xy[xy.length - 1]
  return (
    <div className={cn('relative w-full', className)} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" style={{ left: `${lx}%`, top: `${ly}%` }} />
    </div>
  )
}
