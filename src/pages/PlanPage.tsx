import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Send, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ElevationChart } from '@/components/ElevationChart'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SessionCard } from '@/components/SessionCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WEEKDAYS_SHORT, addDays, formatDay, today } from '@/lib/coach/dates'
import { formatDistance } from '@/lib/coach/format'
import { isRun, weekMeters } from '@/lib/coach/metrics'
import type { Week } from '@/lib/coach/schema'
import { PHASE_LABEL, TYPE_META } from '@/lib/coach/ui'
import { pushDays, syncStatus } from '@/lib/coros/sync'
import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function PlanPage() {
  const { plan, zones, coros, goal } = usePlan()
  const units = useSettings((s) => s.units)
  const [now] = useState(today)
  const current = plan?.weeks.find((w) => w.start <= now && w.end >= now)?.number ?? 1
  const [selected, setSelected] = useState(current)

  const push = useMutation({
    mutationFn: async (week: Week) => {
      const dates: string[] = []
      for (let d = week.start; d <= week.end; d = addDays(d, 1)) dates.push(d)
      return pushDays(plan!, dates, `la semaine ${week.number}`)
    },
    onSuccess: (ok) => ok && toast.success('Envoyé sur la montre ✓'),
    onError: toast.error,
  })

  if (!plan) {
    return (
      <>
        <PageHeader title="Plan" />
        <Card>
          <EmptyState icon={CalendarDays} title="Aucun plan">
            Fixe ton objectif pour générer ton plan semaine par semaine.
          </EmptyState>
          <Link to="/objectif" className="block">
            <Button className="w-full">Créer mon plan</Button>
          </Link>
        </Card>
      </>
    )
  }

  const week = plan.weeks.find((w) => w.number === selected) ?? plan.weeks[0]
  const volumes = plan.weeks.map((w) => weekMeters(w.sessions.filter(isRun), zones))
  const maxVolume = Math.max(...volumes, 1)
  const days = Array.from({ length: 7 }, (_, i) => addDays(addDays(week.end, -6), i))
  const pending = week.sessions.filter((s) => {
    const st = syncStatus(plan, coros.synced, s)
    return (st === 'not-sent' || st === 'modified') && s.date >= now
  }).length

  return (
    <>
      <PageHeader
        subtitle={`${plan.weeks.length} semaines · course le ${formatDay(plan.raceDate, { day: 'numeric', month: 'long' })}`}
        title={plan.name}
        action={
          <Link to="/objectif" className="shrink-0 text-sm font-semibold text-accent">
            Objectif
          </Link>
        }
      />

      {(goal?.course || plan.raceStrategy) && (
        <Card className="mb-4 p-4">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-semibold">Parcours et stratégie</span>
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
        <p className="text-sm font-medium text-muted-foreground">Progression du volume</p>
        <div className="mt-3 flex h-24 items-end gap-1">
          {plan.weeks.map((w, i) => (
            <button
              key={w.number}
              onClick={() => setSelected(w.number)}
              aria-label={`Semaine ${w.number}`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <span
                className={cn(
                  'w-full rounded-t-md transition-all duration-300',
                  w.number === selected ? 'bg-accent' : w.number === current ? 'bg-foreground/40' : 'bg-muted-foreground/25',
                )}
                style={{ height: `${Math.max(6, (volumes[i] / maxVolume) * 100)}%` }}
              />
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {plan.weeks.map((w) => (
            <button
              key={w.number}
              onClick={() => setSelected(w.number)}
              className={cn(
                'h-8 min-w-8 shrink-0 rounded-full px-2 text-xs font-semibold',
                w.number === selected ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
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
            <p className="text-sm font-semibold text-accent">{PHASE_LABEL[week.phase]}</p>
            <h2 className="text-2xl font-extrabold tracking-tight">Semaine {week.number}</h2>
          </div>
          <p className="text-2xl font-extrabold tabular-nums">{formatDistance(volumes[week.number - 1], units, 0)}</p>
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
                  d === now ? 'bg-accent/15 ring-1 ring-accent' : 'bg-card',
                  (d < week.start || d > week.end) && 'opacity-40',
                )}
              >
                <span className="text-[11px] font-semibold text-muted-foreground">{WEEKDAYS_SHORT[i]}</span>
                <span className="text-sm font-bold tabular-nums">{Number(d.slice(8))}</span>
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

        <div className="mt-4 space-y-2">
          {week.end >= now && (
            <Button className="w-full" onClick={() => push.mutate(week)} disabled={push.isPending}>
              <Send className="size-5" />
              {!coros.created ? 'Envoyer le plan sur la montre' : pending > 0 ? `Envoyer la semaine (${pending} à jour)` : 'Renvoyer la semaine'}
            </Button>
          )}
          {week.number === current && (
            <Link to="/ajuster" className="block">
              <Button variant="secondary" className="w-full">
                <Wand2 className="size-5" /> Ajuster ma semaine
              </Button>
            </Link>
          )}
        </div>
      </section>
    </>
  )
}
