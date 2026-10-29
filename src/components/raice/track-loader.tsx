import { motion, useReducedMotion } from 'motion/react'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { cn } from '@/lib/utils'

/** Piste d'athlétisme (rectangle aux bouts arrondis) : 400 × 200, couloirs concentriques. */
const LANES = [0, 14, 28]
const lanePath = (inset: number) => {
  const r = 80 - inset
  const x0 = 120
  const x1 = 280
  const top = 20 + inset
  const bottom = 180 - inset
  return `M ${x0} ${top} H ${x1} A ${r} ${r} 0 0 1 ${x1} ${bottom} H ${x0} A ${r} ${r} 0 0 1 ${x0} ${top} Z`
}

/**
 * Chargement de l'espace coureur : trois coureurs (traits lumineux) font le tour de la piste,
 * chacun dans son couloir, sous un libellé qui scintille.
 */
export function TrackLoader({ label = 'Loading your plan', className }: { label?: string; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <div role="status" className={cn('flex flex-1 flex-col items-center justify-center gap-6 py-16', className)}>
      <svg viewBox="0 0 400 200" className="w-full max-w-[320px] overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="track-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="400" height="200" fill="url(#track-glow)" />
        {LANES.map((inset) => (
          <path key={inset} d={lanePath(inset)} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
        ))}
        <line x1="200" y1="20" x2="200" y2="62" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} strokeDasharray="2 3" />
        {LANES.map((inset, i) => (
          <motion.path
            key={inset}
            d={lanePath(inset)}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ pathLength: 0.08, pathOffset: 0, opacity: 0.9 - i * 0.25 }}
            animate={reduce ? { pathOffset: 0.15 * i } : { pathOffset: [0, 1] }}
            transition={reduce ? { duration: 0 } : { duration: 2.4 + i * 0.35, ease: 'linear', repeat: Infinity }}
            style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
          />
        ))}
      </svg>
      <TextShimmer as="p" className="text-muted-foreground text-sm">
        {label}
      </TextShimmer>
    </div>
  )
}
