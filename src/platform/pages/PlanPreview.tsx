import { DumbbellIcon, FootprintsIcon, GaugeIcon, LeafIcon, MoonIcon, RouteIcon, ZapIcon, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * Semaine d'exemple sous le hero (en anglais, comme la landing) : une icône par séance, un libellé court
 * et une barre d'intensité qui se remplit à l'apparition. La forme d'un plan, pas de vraies données.
 */
const WEEK: { day: string; type: string; detail: string; icon: LucideIcon; color: string; load: number }[] = [
  { day: 'Mon', type: 'Rest', detail: 'Mobility', icon: MoonIcon, color: 'var(--session-rest)', load: 0.1 },
  { day: 'Tue', type: 'Intervals', detail: '6 × 800 m', icon: ZapIcon, color: 'var(--session-interval)', load: 0.9 },
  { day: 'Wed', type: 'Easy', detail: '45 min', icon: FootprintsIcon, color: 'var(--session-easy)', load: 0.4 },
  { day: 'Thu', type: 'Tempo', detail: '3 × 10 min', icon: GaugeIcon, color: 'var(--session-tempo)', load: 0.75 },
  { day: 'Fri', type: 'Recovery', detail: '30 min', icon: LeafIcon, color: 'var(--session-recovery)', load: 0.25 },
  { day: 'Sat', type: 'Strength', detail: 'Core', icon: DumbbellIcon, color: 'var(--session-strength)', load: 0.35 },
  { day: 'Sun', type: 'Long run', detail: '18 km', icon: RouteIcon, color: 'var(--session-long)', load: 1 },
]

export function PlanPreview() {
  const reduce = useReducedMotion()
  return (
    <div className="bg-card/40 p-4 md:p-8" aria-label="Sample training week">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="font-medium text-sm">
          Week 6 <span className="text-muted-foreground">/ 14</span>
        </p>
        <p className="text-muted-foreground text-xs">Sample week</p>
      </div>
      <motion.ol
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 lg:grid-cols-7"
        initial="hidden"
        transition={{ staggerChildren: reduce ? 0 : 0.07 }}
        viewport={{ once: true, amount: 0.4 }}
        whileInView="shown"
      >
        {WEEK.map((s) => (
          <motion.li
            className="flex min-h-36 flex-col gap-3 bg-background p-3"
            key={s.day}
            variants={{ hidden: { opacity: 0, y: reduce ? 0 : 12 }, shown: { opacity: 1, y: 0 } }}
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">{s.day}</span>
              <span className="flex size-7 items-center justify-center rounded-md" style={{ background: `color-mix(in oklab, ${s.color} 18%, transparent)`, color: s.color }}>
                <s.icon className="size-4" />
              </span>
            </div>
            <div className="mt-auto">
              <p className="font-medium text-sm">{s.type}</p>
              <p className="text-muted-foreground text-xs">{s.detail}</p>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full origin-left rounded-full"
                style={{ background: s.color }}
                transition={{ type: 'spring', visualDuration: 0.8, bounce: 0 }}
                variants={{ hidden: { scaleX: reduce ? s.load : 0 }, shown: { scaleX: s.load } }}
              />
            </div>
          </motion.li>
        ))}
      </motion.ol>
    </div>
  )
}
