import {
  ArrowRightIcon,
  BotIcon,
  CalendarCheckIcon,
  CheckIcon,
  LoaderIcon,
  RefreshCwIcon,
  SendIcon,
  WatchIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Animations de flux de la landing, dans l'esprit des pages produit de Default : une suite d'étapes qui
 * passent d'« en cours » à « fait », des éléments qui se résolvent un par un, puis la boucle recommence.
 * Tout s'affiche à l'état final quand le mouvement est réduit.
 */

/** Étape courante d'une séquence qui boucle, seulement quand le bloc est visible. */
function useSequence(steps: number, stepMs: number, holdMs = 2400) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { amount: 0.4 })
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (reduce || !visible) return
    const t = window.setTimeout(() => setStep((s) => (s + 1) % (steps + 1)), step === steps ? holdMs : stepMs)
    return () => window.clearTimeout(t)
  }, [step, visible, reduce, steps, stepMs, holdMs])
  return { ref, step: reduce ? steps : step }
}

type Status = 'pending' | 'running' | 'done'

function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
        status === 'done' && 'bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-[var(--success)]',
        status === 'running' && 'bg-foreground/10 text-foreground',
        status === 'pending' && 'text-muted-foreground'
      )}
    >
      {status === 'done' && <CheckIcon className="size-3" />}
      {status === 'running' && <LoaderIcon className="size-3 animate-spin" />}
      {status === 'done' ? 'Done' : status === 'running' ? 'Running' : 'Waiting'}
    </span>
  )
}

function Node({ icon: Icon, title, status, children, last }: { icon: LucideIcon; title: string; status: Status; children?: ReactNode; last?: boolean }) {
  return (
    <div className="relative flex gap-3">
      {!last && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-border" />}
      <span
        className={cn(
          'relative z-1 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card transition-colors duration-300',
          status !== 'pending' && 'border-foreground/40 text-foreground',
          status === 'pending' && 'text-muted-foreground'
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2 pb-4 transition-opacity duration-300', status === 'pending' && 'opacity-45')}>
        <div className="flex items-center justify-between gap-2 pt-1.5">
          <span className="font-medium text-sm">{title}</span>
          <StatusPill status={status} />
        </div>
        {children}
      </div>
    </div>
  )
}

const status = (step: number, index: number): Status => (step > index ? 'done' : step === index ? 'running' : 'pending')

// ---------- Montre ----------

/**
 * Montres et leurs logos. `wordmark` : logo en toutes lettres (affiché seul) ; `invert` : marque noire,
 * inversée sur fond sombre (hue-rotate garde le rouge des logos Polar et Suunto).
 */
const WATCHES: { name: string; logo: string; wordmark?: boolean; invert?: boolean; state: 'live' | 'next' | 'soon' }[] = [
  { name: 'COROS', logo: '/partners/coros.png', state: 'live' },
  { name: 'Garmin', logo: '/partners/garmin.png', invert: true, state: 'next' },
  { name: 'Apple Watch', logo: '/partners/apple.png', invert: true, state: 'soon' },
  { name: 'Polar', logo: '/partners/polar.png', wordmark: true, invert: true, state: 'soon' },
  { name: 'Suunto', logo: '/partners/suunto.png', wordmark: true, invert: true, state: 'soon' },
]

function WatchChip({ watch, active }: { watch: (typeof WATCHES)[number]; active: boolean }) {
  return (
    <span
      title={watch.name}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-all duration-300',
        active ? 'border-foreground/50 bg-foreground/10 text-foreground' : 'bg-card text-muted-foreground'
      )}
    >
      <img
        alt={watch.wordmark ? watch.name : ''}
        className={cn('object-contain', watch.wordmark ? 'h-3.5 w-auto' : 'size-3.5 rounded-[3px]', watch.invert && 'invert hue-rotate-180')}
        src={watch.logo}
      />
      {!watch.wordmark && watch.name}
      {watch.state !== 'live' && <span className="opacity-60">· {watch.state === 'next' ? 'next' : 'soon'}</span>}
    </span>
  )
}

export function WatchFlow() {
  const { ref, step } = useSequence(4, 1300)
  return (
    <div ref={ref} className="flex w-full flex-col rounded-xl border bg-card/80 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-muted-foreground text-xs">
        <ZapIcon className="size-3.5" /> Tuesday · Intervals · 9.6 km
      </div>
      <Node icon={RefreshCwIcon} title="1. Sync your data" status={status(step, 0)}>
        <div className="flex flex-wrap gap-1.5">
          {WATCHES.map((w) => (
            <WatchChip key={w.name} watch={w} active={w.state === 'live' && step >= 1} />
          ))}
        </div>
      </Node>
      <Node icon={CalendarCheckIcon} title="2. Create your plan" status={status(step, 1)}>
        <div className="flex gap-1">
          {[0.25, 0.9, 0.35, 0.9, 0.35, 0.9, 0.2].map((h, i) => (
            <motion.span
              key={i}
              className="h-5 flex-1 origin-bottom rounded-sm bg-foreground/40"
              animate={{ scaleY: step >= 2 ? h : 0.1 }}
              transition={{ delay: i * 0.04, type: 'spring', visualDuration: 0.4, bounce: 0.2 }}
            />
          ))}
        </div>
      </Node>
      <Node icon={WatchIcon} title="3. On your wrist" status={status(step, 2)}>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md border bg-background px-2 py-1 tabular-nums">Rep {Math.min(Math.max(step - 1, 1), 6)}/6</span>
          <span className="rounded-md border bg-background px-2 py-1 tabular-nums">3:55 /km</span>
          <span className="text-muted-foreground">800 m</span>
        </div>
      </Node>
      <Node icon={SendIcon} title="4. Run synced back" status={status(step, 3)} last>
        <AnimatePresence>
          {step >= 4 && (
            <motion.p
              className="text-muted-foreground text-xs"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              9.6 km · avg 4:12 /km · matched to Tuesday’s session
            </motion.p>
          )}
        </AnimatePresence>
      </Node>
    </div>
  )
}

// ---------- Coach ----------

const WEEK: { day: string; before: string; after?: string }[] = [
  { day: 'Tue', before: 'Easy 45 min', after: 'Tempo 3 × 10 min' },
  { day: 'Thu', before: 'Tempo 3 × 10 min', after: 'Rest' },
  { day: 'Sat', before: 'Hills 8 × 200 m', after: 'Easy 40 min' },
  { day: 'Sun', before: 'Long run 18 km', after: 'Long run 16 km' },
]

export function CoachFlow() {
  // 0 semaine · 1 message du coureur · 2 l'agent réfléchit · 3 réponse · 4 semaine réécrite
  const { ref, step } = useSequence(4, 1200, 3000)
  return (
    <div ref={ref} className="flex w-full flex-col gap-3 rounded-xl border bg-card/80 p-4 shadow-sm">
      <div className="flex min-h-36 flex-col gap-2">
        <AnimatePresence>
          {step >= 1 && (
            <motion.p
              key="user"
              className="max-w-[85%] self-end rounded-2xl bg-foreground px-3 py-2 text-background text-sm"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              Work trip Thu to Sat, and my calf is tight.
            </motion.p>
          )}
          {step === 2 && (
            <motion.span
              key="typing"
              className="flex items-center gap-2 self-start rounded-2xl border bg-background px-3 py-2 text-muted-foreground text-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <BotIcon className="size-3.5" /> Reading your week
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="size-1 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </span>
            </motion.span>
          )}
          {step >= 3 && (
            <motion.p
              key="agent"
              className="flex max-w-[85%] gap-2 self-start rounded-2xl border bg-background px-3 py-2 text-sm"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <BotIcon className="mt-0.5 size-4 shrink-0" />
              Done: tempo moved to Tuesday, Thursday off, Saturday easy, long run a bit shorter.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-col gap-1.5 border-t pt-3">
        {WEEK.map((d, i) => {
          const changed = step >= 4 && d.after
          return (
            <div key={d.day} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-xs">
              <span className="w-8 shrink-0 text-muted-foreground">{d.day}</span>
              <span className={cn('transition-all duration-300', changed && 'text-muted-foreground line-through')}>{d.before}</span>
              <AnimatePresence>
                {changed && (
                  <motion.span
                    className="ml-auto flex items-center gap-1.5 font-medium"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.12 }}
                  >
                    <ArrowRightIcon className="size-3 text-muted-foreground" /> {d.after}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
