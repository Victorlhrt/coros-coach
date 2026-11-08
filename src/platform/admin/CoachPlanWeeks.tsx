import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { DEFAULT_ZONES } from '@/lib/coach/zones'
import { sessionTotals } from '@/lib/coach/metrics'
import type { Plan, Zone } from '@/lib/coach/schema'
import { Panel } from './ui'

const TYPE: Record<string, { label: string; tone: BadgeTone }> = {
  easy: { label: 'Easy', tone: 'success' },
  recovery: { label: 'Recovery', tone: 'neutral' },
  long: { label: 'Long run', tone: 'info' },
  tempo: { label: 'Tempo', tone: 'warning' },
  interval: { label: 'Intervals', tone: 'danger' },
  strength: { label: 'Strength', tone: 'neutral' },
  race: { label: 'Race', tone: 'danger' },
}

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

/** Plan généré dans le coach, en bref : chaque semaine et ses séances avec leur distance. */
export function CoachPlanWeeks({ plan, zones }: { plan: Plan; zones?: Zone[] | null }) {
  const z = zones?.length ? zones : DEFAULT_ZONES
  const km = (s: Plan['weeks'][number]['sessions'][number]) => sessionTotals(s, z).meters / 1000
  return (
    <Panel title={plan.name} description={`${plan.weeks.length} weeks`}>
      <div className="flex flex-col divide-y">
        {plan.weeks.map((w) => (
          <div key={w.number} className="py-3 first:pt-0 last:pb-0">
            <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">
                Week {w.number} <span className="font-normal text-muted-foreground">· {w.phase}</span>
              </span>
              <span className="tabular-nums">{w.sessions.reduce((a, s) => a + km(s), 0).toFixed(0)} km</span>
            </div>
            <ul className="flex flex-col gap-1">
              {[...w.sessions]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-muted-foreground text-xs">{day.format(new Date(`${s.date}T00:00:00`))}</span>
                    <Badge size="sm" tone={TYPE[s.type]?.tone ?? 'neutral'}>
                      {TYPE[s.type]?.label ?? s.type}
                    </Badge>
                    <span className="ml-auto tabular-nums">{s.type === 'strength' ? `${s.strengthMinutes ?? 30} min` : `${km(s).toFixed(1)} km`}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  )
}
