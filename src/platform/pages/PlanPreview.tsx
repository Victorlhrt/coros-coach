import { cn } from '@/lib/utils'

/** Semaine d'exemple affichée sous le hero (en anglais, comme la landing) : la forme d'un plan, pas de vraies données. */
const WEEK = [
  { day: 'Mon', type: 'Rest', detail: 'Mobility 15 min', color: 'var(--session-rest)' },
  { day: 'Tue', type: 'Intervals', detail: '6 × 800 m at 3:55', color: 'var(--session-interval)' },
  { day: 'Wed', type: 'Easy run', detail: '45 min in zone 2', color: 'var(--session-easy)' },
  { day: 'Thu', type: 'Tempo', detail: '3 × 10 min at threshold', color: 'var(--session-tempo)' },
  { day: 'Fri', type: 'Recovery', detail: '30 min very easy', color: 'var(--session-recovery)' },
  { day: 'Sat', type: 'Strength', detail: 'Core + drills', color: 'var(--session-strength)' },
  { day: 'Sun', type: 'Long run', detail: '18 km with 5 at half-marathon pace', color: 'var(--session-long)' },
]

export function PlanPreview() {
  return (
    <div className="bg-card/40 p-4 md:p-8" aria-label="Sample training week">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-sm">
          Week 6 of 14 · <span className="text-muted-foreground">build phase</span>
        </p>
        <p className="text-muted-foreground text-xs">Sample · half marathon in 1:45</p>
      </div>
      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-7">
        {WEEK.map((s) => (
          <li key={s.day} className="flex min-h-28 flex-col gap-2 bg-background p-3">
            <span className="text-muted-foreground text-xs">{s.day}</span>
            <span className="flex items-center gap-2 font-medium text-sm">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
              {s.type}
            </span>
            <span className={cn('text-muted-foreground text-xs leading-snug')}>{s.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
