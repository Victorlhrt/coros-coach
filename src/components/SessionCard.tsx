import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDay } from '@/lib/coach/dates'
import { formatDistance, formatDuration } from '@/lib/coach/format'
import { sessionTotals } from '@/lib/coach/metrics'
import type { Session } from '@/lib/coach/schema'
import { TYPE_META } from '@/lib/coach/ui'
import { syncStatus } from '@/lib/coros/sync'
import { useSettings } from '@/lib/store/settings'
import { usePlan } from '@/lib/store/plan'
import { SyncBadge } from './SyncBadge'
import { ROUTES } from '@/lib/coach/routes'

export function SessionCard({ session }: { session: Session }) {
  const { plan, zones, coros } = usePlan()
  const units = useSettings((s) => s.units)
  const { seconds, meters } = sessionTotals(session, zones)
  const color = TYPE_META[session.type].color

  return (
    <Link
      to={ROUTES.session(session.id)}
      className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-[var(--shadow-resting)] transition-transform active:scale-[0.98]"
    >
      <span className="h-11 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground capitalize">{formatDay(session.date, { weekday: 'long', day: 'numeric' })}</p>
        <p className="truncate font-medium">{session.title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatDuration(seconds)}</span>
          {meters > 0 && <span>· {formatDistance(meters, units)}</span>}
          {plan && <SyncBadge compact status={syncStatus(plan, coros.synced, session)} />}
        </p>
      </div>
      <ChevronRight className="size-5 text-muted-foreground" />
    </Link>
  )
}
