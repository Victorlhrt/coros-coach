import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { DEFAULT_ZONES } from '@/lib/coach/zones'
import { sessionTotals } from '@/lib/coach/metrics'
import type { Plan, Session, Zone } from '@/lib/coach/schema'
import { formatDate } from '../format'
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

function sessionLine(s: Session, zones: Zone[]) {
  const t = sessionTotals(s, zones)
  if (s.type === 'strength') return `${s.strengthMinutes ?? 30} min`
  const parts = [`${(t.meters / 1000).toFixed(1)} km`, `${Math.round(t.seconds / 60)} min`]
  if (s.elevationGain) parts.push(`${s.elevationGain} m D+`)
  return parts.join(' · ')
}

/** Plan généré dans le coach, semaine par semaine : ce que le coureur voit dans son app. */
export function CoachPlanWeeks({ plan, zones }: { plan: Plan; zones?: Zone[] | null }) {
  const z = zones?.length ? zones : DEFAULT_ZONES
  return (
    <div className="flex flex-col gap-4">
      {plan.overview && (
        <Panel title="Overview">
          <p className="text-sm">{plan.overview}</p>
          {plan.raceStrategy && <p className="mt-3 text-muted-foreground text-sm">{plan.raceStrategy}</p>}
        </Panel>
      )}
      {plan.weeks.map((w) => {
        const km = w.sessions.reduce((a, s) => a + sessionTotals(s, z).meters / 1000, 0)
        return (
          <Panel
            key={w.number}
            title={`Week ${w.number} · ${w.phase}`}
            description={`${formatDate(w.start)} → ${formatDate(w.end)} · ${w.targetKm} km planned (${km.toFixed(1)} km in sessions) · long run ${w.longRunKm} km${w.targetGain ? ` · ${w.targetGain} m D+` : ''}`}
          >
            {w.focus && <p className="mb-3 text-muted-foreground text-sm">{w.focus}</p>}
            <ul className="divide-y">
              {[...w.sessions]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
                    <div className="flex shrink-0 items-center gap-2 sm:w-44 sm:flex-col sm:items-start">
                      <span className="text-muted-foreground text-xs">{formatDate(s.date)}</span>
                      <Badge size="sm" tone={TYPE[s.type]?.tone ?? 'neutral'}>
                        {TYPE[s.type]?.label ?? s.type}
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{s.title}</div>
                      <div className="text-muted-foreground text-xs">{sessionLine(s, z)}</div>
                      <p className="mt-1 text-sm">{s.description}</p>
                    </div>
                  </li>
                ))}
            </ul>
          </Panel>
        )
      })}
    </div>
  )
}
