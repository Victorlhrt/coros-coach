import { History } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { TypeBadge } from '@/components/TypeBadge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration, formatPace, paceUnit } from '@/lib/coach/format'
import { isRun, sessionTotals } from '@/lib/coach/metrics'
import type { Session } from '@/lib/coach/schema'
import type { Activity } from '@/lib/coros/activities'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { cn } from '@/lib/utils'

type Row = { date: string; activity: Activity | null; planned: Session | null }

export function HistoryPage() {
  const connected = useCorosAuth((s) => s.connected)
  const { plan } = usePlan()
  const { data, isLoading, error } = useActivities()

  const now = today()
  const activities = data?.activities ?? []
  const plannedRuns = allSessions(plan).filter((s) => isRun(s) && s.date < now && s.date >= addDays(now, -42))

  const rows: Row[] = [
    ...activities.map((a) => ({ date: a.date, activity: a, planned: plannedRuns.find((s) => s.date === a.date) ?? null })),
    ...plannedRuns.filter((s) => !activities.some((a) => a.date === s.date)).map((s) => ({ date: s.date, activity: null, planned: s })),
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

function HistoryRow({ row }: { row: Row }) {
  const zones = usePlan((s) => s.zones)
  const units = useSettings((s) => s.units)
  const { activity, planned } = row
  const target = planned ? sessionTotals(planned, zones) : null
  const delta = activity?.meters && target?.meters ? (activity.meters - target.meters) / target.meters : null

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground capitalize">{formatDay(row.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
        {planned ? <TypeBadge type={planned.type} /> : <span className="text-xs text-muted-foreground">Hors plan</span>}
      </div>
      <p className="mt-1 font-semibold">{planned?.title ?? activity?.name}</p>

      {activity ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Distance" value={activity.meters ? formatDistance(activity.meters, units) : '—'} />
          <Metric label="Durée" value={activity.seconds ? formatDuration(activity.seconds) : '—'} />
          <Metric label={`Allure ${paceUnit(units)}`} value={activity.paceSecPerKm ? formatPace(activity.paceSecPerKm, units) : '—'} />
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-destructive">Séance non réalisée</p>
      )}

      {target && activity && (
        <p className="mt-3 text-sm text-muted-foreground">
          Prévu {target.meters > 0 ? formatDistance(target.meters, units) : ''} en {formatDuration(target.seconds)}
          {delta !== null && (
            <span className={cn('ml-2 font-semibold', Math.abs(delta) <= 0.1 ? 'text-session-easy' : 'text-session-tempo')}>
              {delta > 0 ? '+' : ''}
              {Math.round(delta * 100)} %
            </span>
          )}
        </p>
      )}
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}
