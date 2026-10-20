import { History } from 'lucide-react'
import { LineChart } from '@/components/arc/line-chart/line-chart'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { TypeBadge } from '@/components/TypeBadge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, formatDay, mondayOf, today } from '@/lib/coach/dates'
import { distanceUnit, distanceValue, formatDistance, formatDuration, formatNumber, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { isRun, sessionTotals } from '@/lib/coach/metrics'
import type { Session, Zone } from '@/lib/coach/schema'
import type { Activity } from '@/lib/coros/activities'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { linkedActivity } from '@/lib/coach/links'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { cn } from '@/lib/utils'

type Row = { date: string; activity: Activity | null; planned: Session | null }

export function HistoryPage() {
  const connected = useCorosAuth((s) => s.connected)
  const { plan, links, zones } = usePlan()
  const units = useSettings((s) => s.units)
  const { data, isLoading, error } = useActivities()

  const now = today()
  const activities = data?.activities ?? []
  const plannedRuns = allSessions(plan).filter((s) => isRun(s) && s.date < now && s.date >= addDays(now, -42))

  // Séances prévues avec leur activité liée (auto ou manuelle), puis les activités hors plan.
  const linked = new Set<string>()
  const plannedRows: Row[] = plannedRuns.map((s) => {
    const activity = linkedActivity(s, links, activities)
    if (activity) linked.add(activity.labelId)
    return { date: s.date, activity, planned: s }
  })
  const rows: Row[] = [
    ...plannedRows,
    ...activities.filter((a) => !linked.has(a.labelId)).map((a) => ({ date: a.date, activity: a, planned: null })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <PageHeader title="Historique" subtitle="6 dernières semaines" />
      {!connected && (
        <Card>
          <EmptyState icon={History} title="COROS non connecté">Connecte ta montre dans Réglages.</EmptyState>
        </Card>
      )}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {error && <Card className="text-sm text-destructive">{error.message}</Card>}
      {data && activities.length > 0 && (
        <Card className="mb-4 p-4">
          <VolumeChart activities={activities} planned={plan ? allSessions(plan).filter(isRun) : []} zones={zones} units={units} />
        </Card>
      )}
      {data && rows.length === 0 && (
        <Card>
          <EmptyState icon={History} title="Aucune activité">
            Aucune course trouvée sur les 6 dernières semaines.
          </EmptyState>
          {data.raw !== undefined && activities.length === 0 && (
            <details className="text-xs text-muted-foreground">
              <summary>Réponse COROS brute</summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap">{JSON.stringify(data.raw, null, 2).slice(0, 4000)}</pre>
            </details>
          )}
        </Card>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <HistoryRow key={`${r.date}-${i}`} row={r} />
        ))}
      </div>
    </>
  )
}

const SERIES = [
  { key: 'done', label: 'Réalisé', area: true },
  { key: 'planned', label: 'Prévu', dashed: true, area: false },
]

/** Volume par semaine sur les 6 dernières semaines : réalisé (activités COROS) contre prévu (plan). */
function VolumeChart({ activities, planned, zones, units }: { activities: Activity[]; planned: Session[]; zones: Zone[]; units: Units }) {
  const thisMonday = mondayOf(today())
  const data = [5, 4, 3, 2, 1, 0].map((n) => {
    const start = addDays(thisMonday, -7 * n)
    const end = addDays(start, 6)
    const done = activities.filter((a) => a.date >= start && a.date <= end).reduce((a, x) => a + (x.meters ?? 0), 0)
    const plannedMeters = planned.filter((s) => s.date >= start && s.date <= end).reduce((a, s) => a + sessionTotals(s, zones).meters, 0)
    return {
      key: start,
      label: n === 0 ? 'Cette semaine' : `Semaine du ${formatDay(start, { day: 'numeric', month: 'short' })}`,
      axisLabel: formatDay(start, { day: 'numeric', month: 'short' }),
      values: { done: distanceValue(done, units), planned: planned.length > 0 ? distanceValue(plannedMeters, units) : undefined },
    }
  })
  const series = planned.length > 0 ? SERIES : SERIES.slice(0, 1)
  return (
    <LineChart
      data={data}
      series={series}
      label="Volume par semaine"
      unit={distanceUnit(units)}
      height={150}
      legend={series.length > 1}
      categoryLabel="Semaine"
      emptyLabel="Aucune activité"
      formatValue={(v) => `${formatNumber(v)} ${distanceUnit(units)}`}
      formatTick={formatNumber}
    />
  )
}

function HistoryRow({ row }: { row: Row }) {
  const zones = usePlan((s) => s.zones)
  const fb = usePlan((s) => (row.planned ? s.feedback[row.planned.id] : undefined))
  const units = useSettings((s) => s.units)
  const { activity, planned } = row
  const target = planned ? sessionTotals(planned, zones) : null
  const delta = activity?.meters && target?.meters ? (activity.meters - target.meters) / target.meters : null

  const body = (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground capitalize">{formatDay(row.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
        {planned ? <TypeBadge type={planned.type} /> : <span className="text-xs text-muted-foreground">Hors plan</span>}
      </div>
      <p className="mt-1 font-medium">{planned?.title ?? activity?.name}</p>

      {activity ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Distance" value={activity.meters ? formatDistance(activity.meters, units) : '—'} />
          <Metric label="Durée" value={activity.seconds ? formatDuration(activity.seconds) : '—'} />
          <Metric label={`Allure ${paceUnit(units)}`} value={activity.paceSecPerKm ? formatPace(activity.paceSecPerKm, units) : '—'} />
        </div>
      ) : (
        <p className="mt-2 text-sm font-medium text-destructive">Séance non réalisée</p>
      )}

      {target && activity && (
        <p className="mt-3 text-sm text-muted-foreground">
          Prévu {target.meters > 0 ? formatDistance(target.meters, units) : ''} en {formatDuration(target.seconds)}
          {delta !== null && (
            <span className={cn('ml-2 font-medium', Math.abs(delta) <= 0.1 ? 'text-session-easy' : 'text-session-tempo')}>
              {delta > 0 ? '+' : ''}
              {Math.round(delta * 100)} %
            </span>
          )}
        </p>
      )}
      {fb && (
        <p className="mt-1 text-sm text-muted-foreground">
          {'★'.repeat(fb.rating)}
          {'☆'.repeat(5 - fb.rating)} · RPE {fb.rpe}/10{fb.tags.length > 0 && ` · ${fb.tags.join(', ')}`}
        </p>
      )}
    </Card>
  )
  return row.planned ? (
    <Link to={`/seance/${row.planned.id}`} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
    </div>
  )
}
