import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { SlotText } from '@/components/arc/slot-text/slot-text'
import { CalendarDays, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ElevationChart } from '@/components/ElevationChart'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SessionCard } from '@/components/SessionCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WEEKDAYS_SHORT, addDays, formatDay, today } from '@/lib/coach/dates'
import { distanceUnit, distanceValue, formatDistance, formatNumber } from '@/lib/coach/format'
import { isRun, weekMeters } from '@/lib/coach/metrics'
import { PHASE_LABEL, TYPE_META } from '@/lib/coach/ui'
import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { cn } from '@/lib/utils'

export function PlanPage() {
  const { plan, zones, goal } = usePlan()
  const units = useSettings((s) => s.units)
  const [now] = useState(today)
  const current = plan?.weeks.find((w) => w.start <= now && w.end >= now)?.number ?? 1
  const [selected, setSelected] = useState(current)

  if (!plan) {
    return (
      <>
        <PageHeader title="Plan" />
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Aucun plan"
            action={
              <Link to="/objectif">
                <Button>Créer mon plan</Button>
              </Link>
            }
          >
            Fixe ton objectif pour générer ton plan semaine par semaine.
          </EmptyState>
        </Card>
      </>
    )
  }

  const week = plan.weeks.find((w) => w.number === selected) ?? plan.weeks[0]
  const volumes = plan.weeks.map((w) => weekMeters(w.sessions.filter(isRun), zones))
  const days = Array.from({ length: 7 }, (_, i) => addDays(addDays(week.end, -6), i))

  return (
    <>
      <PageHeader
        subtitle={`${plan.weeks.length} semaines · course le ${formatDay(plan.raceDate, { day: 'numeric', month: 'long' })}`}
        title={plan.name}
        action={
          <Link to="/objectif" className="shrink-0 text-sm font-medium text-accent">
            Objectif
          </Link>
        }
      />

      {(goal?.course || plan.raceStrategy) && (
        <Card className="mb-4 p-4">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium">Parcours et stratégie</span>
              {goal?.course && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {goal.course.distanceKm} km · {goal.course.gain} m D+
                </span>
              )}
            </summary>
            {goal?.course && <ElevationChart course={goal.course} className="mt-3" />}
            {plan.raceStrategy && <p className="mt-3 text-sm text-muted-foreground">{plan.raceStrategy}</p>}
          </details>
        </Card>
      )}

      <Card className="p-4">
        <BarChart
          data={plan.weeks.map((w, i) => ({ key: String(w.number), label: `Semaine ${w.number}`, axisLabel: `S${w.number}`, value: distanceValue(volumes[i], units) }))}
          label="Volume prévu"
          period={`${plan.weeks.length} semaines`}
          unit={distanceUnit(units)}
          averageLabel="Moyenne par semaine"
          valueLabel="Volume prévu"
          categoryLabel="Semaine"
          showAverage={false}
          height={112}
          formatValue={formatNumber}
        />
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {plan.weeks.map((w) => (
            <button
              key={w.number}
              onClick={() => setSelected(w.number)}
              aria-pressed={w.number === selected}
              aria-label={`Semaine ${w.number}`}
              className={cn(
                'h-8 min-w-8 shrink-0 rounded-full border px-2 text-xs font-medium transition-colors',
                w.number === selected
                  ? 'border-[color-mix(in_oklab,var(--accent)_42%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_11%,var(--surface))] text-foreground'
                  : w.number === current
                    ? 'border-[var(--border-strong)] text-foreground'
                    : 'border-[var(--border)] text-[var(--text-secondary)]',
              )}
            >
              S{w.number}
            </button>
          ))}
        </div>
      </Card>

      <section key={week.number} className="animate-page-in mt-5">
        <div className="flex items-end justify-between px-1">
          <div>
            <p className="text-sm font-medium text-accent">{PHASE_LABEL[week.phase]}</p>
            <h2 className="text-2xl font-medium tracking-tight">Semaine {week.number}</h2>
          </div>
          <SlotText value={formatDistance(volumes[week.number - 1], units, 0)} className="text-2xl font-medium" />
        </div>
        <p className="mt-1 px-1 text-sm text-muted-foreground">{week.focus}</p>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {days.map((d, i) => {
            const sessions = week.sessions.filter((s) => s.date === d)
            return (
              <div
                key={d}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl py-2',
                  d === now ? 'bg-accent/15 ring-1 ring-accent' : 'border border-[var(--border-subtle)] bg-[var(--surface)]',
                  (d < week.start || d > week.end) && 'opacity-40',
                )}
              >
                <span className="text-[11px] font-medium text-muted-foreground">{WEEKDAYS_SHORT[i]}</span>
                <span className="text-sm font-medium tabular-nums">{Number(d.slice(8))}</span>
                <div className="flex h-2 gap-0.5">
                  {sessions.length === 0 ? (
                    <span className="size-2 rounded-full bg-muted" />
                  ) : (
                    sessions.map((s) => <span key={s.id} className="size-2 rounded-full" style={{ backgroundColor: TYPE_META[s.type].color }} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 space-y-2">
          {week.sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
          {week.sessions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Semaine de repos.</p>}
        </div>

        {week.number === current && (
          <Link to="/ajuster" className="mt-4 block">
            <Button variant="secondary" className="w-full">
              <Wand2 className="size-5" /> Ajuster ma semaine
            </Button>
          </Link>
        )}
      </section>
    </>
  )
}
