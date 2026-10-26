import { cn } from '@/lib/utils'

/** Semaine d'exemple affichée sous le hero : la forme d'un plan, pas de vraies données. */
const WEEK = [
  { day: 'Lun', type: 'Repos', detail: 'Mobilité 15 min', color: 'var(--session-rest)' },
  { day: 'Mar', type: 'Fractionné', detail: '6 × 800 m à 3:55', color: 'var(--session-interval)' },
  { day: 'Mer', type: 'Footing', detail: '45 min en zone 2', color: 'var(--session-easy)' },
  { day: 'Jeu', type: 'Tempo', detail: '3 × 10 min au seuil', color: 'var(--session-tempo)' },
  { day: 'Ven', type: 'Récup', detail: '30 min très facile', color: 'var(--session-recovery)' },
  { day: 'Sam', type: 'Renfo', detail: 'Gainage + PPG', color: 'var(--session-strength)' },
  { day: 'Dim', type: 'Sortie longue', detail: '18 km dont 5 à l’allure semi', color: 'var(--session-long)' },
]

export function PlanPreview() {
  return (
    <div className="bg-card/40 p-4 md:p-8" aria-label="Exemple de semaine d'entraînement">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-sm">
          Semaine 6 sur 14 · <span className="text-muted-foreground">phase de développement</span>
        </p>
        <p className="font-mono text-muted-foreground text-xs">Exemple · semi-marathon en 1:45</p>
      </div>
      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-7">
        {WEEK.map((s) => (
          <li key={s.day} className="flex min-h-28 flex-col gap-2 bg-background p-3">
            <span className="font-mono text-muted-foreground text-xs">{s.day}</span>
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
