import { flatten } from '@/lib/coach/metrics'
import type { Block, Zone } from '@/lib/coach/schema'
import { zoneColor } from '@/lib/coach/ui'
import { cn } from '@/lib/utils'

/** Barres des blocs : largeur = durée, hauteur et couleur = zone. */
export function WorkoutChart({ blocks, zones, className }: { blocks: Block[]; zones: Zone[]; className?: string }) {
  const steps = flatten(blocks, zones)
  const total = steps.reduce((a, s) => a + s.seconds, 0) || 1
  return (
    <div className={cn('flex h-24 items-end gap-[2px]', className)} role="img" aria-label="Profil d’intensité de la séance">
      {steps.map((s, i) => (
        <div
          key={i}
          className="rounded-t-[4px] transition-[height] duration-500"
          style={{
            width: `${(s.seconds / total) * 100}%`,
            minWidth: 3,
            height: `${18 + (s.zone / 6) * 82}%`,
            backgroundColor: zoneColor(s.zone),
          }}
        />
      ))}
    </div>
  )
}
