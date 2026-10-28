import { RotateCw } from 'lucide-react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface StretchRefreshProps {
  onRefresh: () => Promise<unknown>
  children: ReactNode
  className?: string
  /** Distance de tirage (px) déclenchant l'actualisation, 72 par défaut */
  threshold?: number
  disabled?: boolean
}

type Phase = 'idle' | 'pull' | 'release' | 'refreshing'

const INTERACTIVE = 'button, a, input, textarea, select, label, summary, [role="button"], [role="slider"], [contenteditable="true"]'
const SPRING = { type: 'spring', stiffness: 420, damping: 38 } as const
const HOLD = 44

/** Premier ancêtre réellement défilable (sinon le document). */
function scrollParent(el: HTMLElement): Element {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return document.scrollingElement ?? document.documentElement
}

/**
 * Tirer pour actualiser façon Arc « Stretch refresh » : un filet s'étire en haut à mesure qu'on tire
 * (toucher, glisser à la souris, défilement trackpad au sommet), se tend au seuil, puis ondule pendant l'actualisation.
 */
export function StretchRefresh({ onRefresh, children, className, threshold = 72, disabled }: StretchRefreshProps) {
  const reduce = useReducedMotion() ?? false
  const rootRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const lineScale = useTransform(y, [0, threshold], [0.04, 1], { clamp: true })
  const hintOpacity = useTransform(y, [16, 36], [0, 1], { clamp: true })
  const [phase, setPhase] = useState<Phase>('idle')

  // Les écouteurs natifs lisent l'état courant via des refs pour ne pas être réattachés à chaque rendu.
  const phaseRef = useRef<Phase>('idle')
  const opts = useRef({ onRefresh, threshold, disabled, reduce })
  useEffect(() => {
    opts.current = { onRefresh, threshold, disabled, reduce }
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const setP = (p: Phase) => {
      if (phaseRef.current !== p) {
        phaseRef.current = p
        setPhase(p)
      }
    }
    const moveTo = (target: number) => {
      if (opts.current.reduce) y.set(target)
      else animate(y, target, SPRING)
    }
    const busy = () => opts.current.disabled || phaseRef.current === 'refreshing'
    const atTop = () => root.scrollTop <= 0 && scrollParent(root).scrollTop <= 0
    // Résistance élastique : on s'approche asymptotiquement de ~1,75 × seuil.
    const rubber = (d: number) => {
      const max = opts.current.threshold * 1.75
      return max * (1 - Math.exp(-Math.max(0, d) / max))
    }
    const setPull = (v: number) => {
      y.set(v)
      setP(v <= 0 ? 'idle' : v >= opts.current.threshold ? 'release' : 'pull')
    }
    const release = () => {
      if (phaseRef.current === 'release') {
        setP('refreshing')
        moveTo(HOLD)
        Promise.resolve()
          .then(() => opts.current.onRefresh())
          .catch(() => undefined)
          .finally(() => {
            setP('idle')
            moveTo(0)
          })
      } else if (phaseRef.current !== 'refreshing') {
        setP('idle')
        moveTo(0)
      }
    }

    // Toucher
    let touchStart: number | null = null
    const onTouchStart = (e: TouchEvent) => {
      touchStart = !busy() && e.touches.length === 1 && atTop() ? e.touches[0].clientY : null
    }
    const onTouchMove = (e: TouchEvent) => {
      if (touchStart === null || busy()) return
      const d = e.touches[0].clientY - touchStart
      if (d <= 0) {
        if (y.get() > 0) setPull(0)
        return
      }
      if (e.cancelable) e.preventDefault()
      setPull(rubber(d))
    }
    const onTouchEnd = () => {
      if (touchStart === null) return
      touchStart = null
      release()
    }

    // Souris : le glisser ne démarre qu'après 6 px verticaux, hors éléments interactifs.
    let mouseStart: number | null = null
    let dragging = false
    const swallowClick = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }
    const onMouseMove = (e: MouseEvent) => {
      if (mouseStart === null) return
      const d = e.clientY - mouseStart
      if (!dragging) {
        if (d <= 6) return
        dragging = true
        mouseStart += 6
        window.addEventListener('click', swallowClick, { capture: true, once: true })
      }
      e.preventDefault()
      setPull(rubber(e.clientY - mouseStart))
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (dragging) {
        // Le click qui suit le mouseup est avalé ; on retire le garde s'il n'arrive pas.
        setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 0)
        release()
      }
      mouseStart = null
      dragging = false
    }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || busy() || !atTop()) return
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
      mouseStart = e.clientY
      dragging = false
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    // Molette / trackpad : on accumule le dépassement vers le haut, relâché après 160 ms sans événement.
    // Après un relâchement, on ignore l'inertie jusqu'à 300 ms de silence.
    let wheelAcc = 0
    let wheelIdle: ReturnType<typeof setTimeout> | undefined
    let wheelLocked = false
    let unlock: ReturnType<typeof setTimeout> | undefined
    const onWheel = (e: WheelEvent) => {
      if (wheelLocked) {
        clearTimeout(unlock)
        unlock = setTimeout(() => (wheelLocked = false), 300)
        if (y.get() > 0) e.preventDefault()
        return
      }
      if (busy()) return
      const pulling = wheelAcc > 0
      if (!pulling && (e.deltaY >= 0 || !atTop())) return
      e.preventDefault()
      wheelAcc = Math.max(0, wheelAcc - e.deltaY)
      setPull(rubber(wheelAcc))
      clearTimeout(wheelIdle)
      wheelIdle = setTimeout(() => {
        wheelAcc = 0
        wheelLocked = true
        unlock = setTimeout(() => (wheelLocked = false), 300)
        release()
      }, 160)
    }

    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('touchend', onTouchEnd)
    root.addEventListener('touchcancel', onTouchEnd)
    root.addEventListener('mousedown', onMouseDown)
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', onTouchEnd)
      root.removeEventListener('touchcancel', onTouchEnd)
      root.removeEventListener('mousedown', onMouseDown)
      root.removeEventListener('wheel', onWheel)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('click', swallowClick, { capture: true })
      clearTimeout(wheelIdle)
      clearTimeout(unlock)
    }
  }, [y])

  const refreshing = phase === 'refreshing'
  const hint = refreshing ? 'Refreshing…' : phase === 'release' ? 'Release to refresh' : 'Pull to refresh'

  return (
    <div ref={rootRef} className={cn('relative', className)} aria-busy={refreshing}>
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center gap-2 overflow-hidden" style={{ height: y }}>
        <div className="relative h-0.5 w-[min(220px,60%)]">
          {refreshing ? (
            <div className="absolute inset-0 overflow-hidden rounded-full bg-foreground/15">
              {reduce ? (
                <div className="absolute inset-0 bg-foreground/60" />
              ) : (
                <motion.div
                  className="absolute inset-y-0 w-1/2 rounded-full bg-linear-to-r from-transparent via-foreground to-transparent"
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
                />
              )}
            </div>
          ) : (
            <motion.div
              className={cn('absolute inset-0 rounded-full transition-colors', phase === 'release' ? 'bg-foreground' : 'bg-foreground/40')}
              style={{ scaleX: lineScale }}
            />
          )}
        </div>
        <motion.p className="text-muted-foreground text-xs" style={{ opacity: hintOpacity }}>
          {hint}
        </motion.p>
      </motion.div>
      <span className="sr-only" role="status">
        {refreshing ? 'Refreshing…' : ''}
      </span>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  )
}

/** Bouton rond d'actualisation pour un en-tête de panneau ; l'icône tourne pendant `refreshing`. */
export function RefreshButton({ refreshing, className, disabled, 'aria-label': ariaLabel = 'Refresh', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { refreshing?: boolean }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={refreshing}
      disabled={disabled || refreshing}
      className={cn(
        'inline-grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      <RotateCw className={cn('size-4', refreshing && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
    </button>
  )
}
