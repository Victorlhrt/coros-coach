import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { Skeleton } from '@/components/shadcn/skeleton'
import { WEEKDAYS_SHORT, addDays, formatDay, today } from '@/lib/coach/dates'
import { distanceUnit, distanceValue, formatDistance, formatDuration, formatNumber, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { isRun } from '@/lib/coach/metrics'
import { ROUTES } from '@/lib/coach/routes'
import type { Session } from '@/lib/coach/schema'
import { TYPE_META } from '@/lib/coach/ui'
import type { Activity } from '@/lib/coros/activities'
import { useActivityHistory } from '@/lib/coros/activity-hooks'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { cn } from '@/lib/utils'
import { isDone, lastWeeks, weeklyMetrics } from './coach-data'

/**
 * Analytics › Runs : vue d'une semaine à la fois, façon Strava (totaux, frise lundi → dimanche, sorties
 * et séances manquées), sous le tableau de bord. Flèches pour passer d'une semaine à l'autre.
 */

const HISTORY_WEEKS = 16

type Row = { date: string; activity?: Activity; session?: Session }

export function WeekView() {
  const { plan, zones, links, feedback } = usePlan()
  const connected = useCorosAuth((s) => s.connected)
  const units = useSettings((s) => s.units)
  const history = useActivityHistory()
  const [now] = useState(today)
  // 0 = semaine en cours, 1 = la précédente…
  const [back, setBack] = useState(0)
  const acts = useMemo(() => history.data ?? [], [history.data])

  const weeks = useMemo(() => {
    const sessions = allSessions(plan)
    const byLabel = new Map(sessions.flatMap((s) => (links[s.id]?.labelId ? [[links[s.id].labelId as string, s] as const] : [])))
    return weeklyMetrics(lastWeeks(now, HISTORY_WEEKS), acts, plan, zones).map((w) => {
      const end = addDays(w.start, 6)
      const runs: Row[] = acts.filter((a) => a.date >= w.start && a.date <= end).map((a) => ({ date: a.date, activity: a, session: byLabel.get(a.labelId) }))
      const planned = sessions.filter((s) => s.date >= w.start && s.date <= end && isRun(s) && !isDone(s, links, feedback))
      const missed: Row[] = planned.filter((s) => s.date < now).map((s) => ({ date: s.date, session: s }))
      return {
        ...w,
        meters: runs.reduce((a, r) => a + (r.activity?.meters ?? 0), 0),
        seconds: runs.reduce((a, r) => a + (r.activity?.seconds ?? 0), 0),
        rows: [...runs, ...missed].sort((a, b) => b.date.localeCompare(a.date)),
        // Séances encore à venir : seulement un contour dans la frise.
        upcoming: new Set(planned.filter((s) => s.date >= now).map((s) => s.date)),
      }
    })
  }, [acts, plan, zones, links, feedback, now])

  // Plus grosse journée de l'historique : échelle commune des pastilles, d'une semaine à l'autre.
  const maxDay = useMemo(() => {
    const perDay = new Map<string, number>()
    for (const a of acts) perDay.set(a.date, (perDay.get(a.date) ?? 0) + (a.meters ?? 0))
    return Math.max(1, ...perDay.values())
  }, [acts])

  if (!connected) return null
  if (history.isPending) return <Skeleton className="h-[320px] rounded-[28px]" />

  const week = weeks[weeks.length - 1 - back]
  const nav = (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="size-8 rounded-full" aria-label="Previous week" disabled={back >= weeks.length - 1} onClick={() => setBack((b) => b + 1)}>
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="icon" className="size-8 rounded-full" aria-label="Next week" disabled={back === 0} onClick={() => setBack((b) => b - 1)}>
        <ChevronRight />
      </Button>
    </div>
  )
  return <WeekCard week={week} now={now} maxDay={maxDay} units={units} title={back === 0 ? 'This week' : undefined} nav={nav} />
}

type FeedWeek = ReturnType<typeof weeklyMetrics>[number] & { meters: number; seconds: number; rows: Row[]; upcoming: Set<string> }

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('mt-0.5 whitespace-nowrap font-medium tabular-nums tracking-tight', big ? 'text-xl sm:text-2xl' : 'text-[15px]')}>{value}</p>
    </div>
  )
}

function WeekCard({ week, now, maxDay, units, title, nav }: { week: FeedWeek; now: string; maxDay: number; units: Units; title?: string; nav?: React.ReactNode }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.start, i))
  const unit = distanceUnit(units)
  const empty = week.rows.length === 0 && week.upcoming.size === 0
  return (
    <Panel>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 pt-5 pb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-medium text-[17px] tracking-tight">{title ?? `Week of ${formatDay(week.start, { day: 'numeric', month: 'short' })}`}</h2>
          <span className="text-muted-foreground text-sm">
            {formatDay(week.start, { day: 'numeric', month: 'short' })} – {formatDay(addDays(week.start, 6), { day: 'numeric', month: 'short' })}
            {empty && ' · No runs'}
          </span>
        </div>
        {nav}
      </header>
      {!empty && (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-3 px-6 pb-5 sm:grid sm:grid-cols-4 sm:gap-4">
            <Stat label="Distance" value={formatDistance(week.meters, units)} />
            <Stat label="Time" value={week.seconds ? formatDuration(week.seconds) : '—'} />
            <Stat label="Runs" value={String(week.runs)} />
            {week.plannedKm > 0 && (
              <Stat label="Plan" value={`${formatNumber(Math.round(distanceValue(week.meters, units)))} / ${formatNumber(Math.round(distanceValue(week.plannedKm * 1000, units)))} ${unit}`} />
            )}
          </div>
          <DayStrip days={days} rows={week.rows} upcoming={week.upcoming} now={now} maxDay={maxDay} />
          {week.rows.length > 0 && (
            <div className="divide-y border-t">
              {week.rows.map((r, i) => (
                <RunRow key={r.activity?.labelId ?? `${r.session?.id}-${i}`} row={r} units={units} />
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

/** Lundi → dimanche : une pastille par jour, sa taille suit la distance, sa couleur le type de séance. */
function DayStrip({ days, rows, upcoming, now, maxDay }: { days: string[]; rows: Row[]; upcoming: Set<string>; now: string; maxDay: number }) {
  return (
    <div className="grid grid-cols-7 border-t px-3 py-4 sm:px-6">
      {days.map((d, i) => {
        const runs = rows.filter((r) => r.date === d && r.activity)
        const meters = runs.reduce((a, r) => a + (r.activity?.meters ?? 0), 0)
        const missed = rows.some((r) => r.date === d && !r.activity)
        const session = runs.find((r) => r.session)?.session
        const size = meters ? 10 + Math.sqrt(meters / maxDay) * 22 : 0
        return (
          <div key={d} className="flex flex-col items-center gap-2">
            <span className="flex size-8 items-center justify-center">
              {meters > 0 ? (
                <span className="rounded-full" style={{ width: size, height: size, background: session ? TYPE_META[session.type].color : 'var(--foreground)' }} />
              ) : missed || upcoming.has(d) ? (
                <span className={cn('size-2.5 rounded-full border', missed ? 'border-muted-foreground/60' : 'border-dashed border-muted-foreground/60')} />
              ) : (
                <span className="size-1 rounded-full bg-foreground/20" />
              )}
            </span>
            <span className={cn('text-xs', d === now ? 'font-medium text-foreground' : 'text-muted-foreground')}>{WEEKDAYS_SHORT[i]}</span>
          </div>
        )
      })}
    </div>
  )
}

function RunRow({ row, units }: { row: Row; units: Units }) {
  const { activity: a, session: s } = row
  const meta = s ? TYPE_META[s.type] : null
  const day = formatDay(row.date, { weekday: 'short', day: 'numeric', month: 'short' })
  const details = a ? [a.seconds ? formatDuration(a.seconds) : null, a.paceSecPerKm ? `${formatPace(a.paceSecPerKm, units)} ${paceUnit(units)}` : null, a.avgHr ? `${a.avgHr} bpm` : null] : []
  const body = (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-6 py-3.5 sm:grid-cols-[minmax(0,1fr)_5rem_4.5rem_6rem_4.5rem]', !a && 'opacity-60')}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: meta?.color ?? 'var(--border)' }} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-sm">{a ? a.name : s?.title}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {day}
            {meta && (
              <>
                {' · '}
                <span style={{ color: meta.color }}>{meta.label}</span>
              </>
            )}
          </span>
          {a && <span className="block truncate text-muted-foreground text-xs tabular-nums sm:hidden">{details.filter(Boolean).join(' · ')}</span>}
        </span>
      </span>
      {a ? (
        <>
          <span className="text-right font-medium text-sm tabular-nums">{a.meters ? formatDistance(a.meters, units) : '—'}</span>
          {details.map((d, i) => (
            <span key={i} className="hidden text-right text-muted-foreground text-sm tabular-nums sm:block">
              {d ?? '—'}
            </span>
          ))}
        </>
      ) : (
        <span className="text-right text-muted-foreground text-sm sm:col-span-4">Missed</span>
      )}
    </div>
  )
  return s ? (
    <Link to={ROUTES.session(s.id)} className="block transition-colors hover:bg-foreground/[0.03]">
      {body}
    </Link>
  ) : (
    body
  )
}
