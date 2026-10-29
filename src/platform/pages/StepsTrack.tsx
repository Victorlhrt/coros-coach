import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * « Four steps » : une piste d'athlétisme en arc (même langage que les anneaux derrière la carte de connexion)
 * sur laquelle les étapes tournent. Desktop : avance seule toutes les quelques secondes, en pause au survol.
 * Mobile : on fait glisser au doigt. Le mouvement réduit coupe la lecture auto et les transitions.
 */

export type TrackStep = { title: string; text: string; icon: ReactNode; visual: ReactNode }

const AUTO_MS = 4200
const PAD_TOP = 36
const CARD_H = 320
/** Hauteur, dans la carte, du point qui suit la piste (0 = haut, 1 = bas). */
const ANCHOR = 0.58
const LANES = 6
const LANE_W = 13
const SPRING = { type: 'spring', visualDuration: 0.7, bounce: 0.12 } as const

type Geometry = { width: number; cardW: number; spacing: number; radius: number; step: number }

function geometryFor(width: number): Geometry {
  const mobile = width < 640
  const cardW = mobile ? Math.min(256, width - 104) : 280
  const spacing = cardW + (mobile ? 10 : 40)
  const radius = mobile ? 640 : 1150
  return { width, cardW, spacing, radius, step: spacing / radius }
}

/** Décalage d'une carte par rapport à l'étape active, ramené dans [-n/2, n/2) pour boucler. */
const wrap = (offset: number, n: number) => ((((offset + n / 2) % n) + n) % n) - n / 2

const mod = (v: number, n: number) => ((v % n) + n) % n

export function StepsTrack({ steps }: { steps: TrackStep[] }) {
  const n = steps.length
  const root = useRef<HTMLDivElement>(null)
  const visible = useInView(root, { amount: 0.4 })
  const reduce = useReducedMotion() ?? false
  const [geo, setGeo] = useState<Geometry | null>(null)
  // Position continue (en étapes) ; `target` est l'étape visée, non bornée pour toujours tourner dans le même sens.
  const progress = useMotionValue(0)
  const [target, setTarget] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const active = mod(target, n)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    const measure = () => setGeo((g) => (g?.width === node.clientWidth ? g : geometryFor(node.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Lecture auto seulement avec un pointeur fin (desktop) ; au doigt, c'est le glissement qui pilote.
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setAutoplay(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const playing = autoplay && visible && !hovered && !dragging && !reduce

  useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(() => setTarget((v) => v + 1), AUTO_MS)
    return () => window.clearTimeout(t)
  }, [playing, target])

  const animation = useRef<ReturnType<typeof animate> | null>(null)
  useEffect(() => {
    if (dragging) return
    animation.current?.stop()
    animation.current = reduce ? (progress.jump(target), null) : animate(progress, target, SPRING)
  }, [target, dragging, reduce, progress])

  // ---------- Glisser ----------
  const drag = useRef<{ id: number; x: number; p: number; moved: boolean; t: number; vx: number; lastX: number } | null>(null)
  const suppressClick = useRef(false)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !geo) return
    drag.current = { id: e.pointerId, x: e.clientX, p: progress.get(), moved: false, t: e.timeStamp, vx: 0, lastX: e.clientX }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !geo) return
    const dx = e.clientX - d.x
    if (!d.moved) {
      if (Math.abs(dx) < 6) return
      d.moved = true
      animation.current?.stop()
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    const dt = Math.max(1, e.timeStamp - d.t)
    d.vx = 0.8 * ((e.clientX - d.lastX) / dt) + 0.2 * d.vx
    d.lastX = e.clientX
    d.t = e.timeStamp
    progress.set(d.p - dx / geo.spacing)
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.moved || !geo) return
    suppressClick.current = true
    // Un coup sec suffit pour passer à l'étape suivante, sans dépasser d'une étape à la fois par geste.
    const projected = progress.get() - (d.vx * 180) / geo.spacing
    const next = Math.max(Math.round(d.p) - 1, Math.min(Math.round(d.p) + 1, Math.round(projected)))
    setTarget(next)
    setDragging(false)
  }

  function go(delta: number) {
    setTarget((v) => v + delta)
  }
  function goTo(index: number) {
    setTarget((v) => v + wrap(index - mod(v, n), n))
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowLeft') go(-1)
    else return
    e.preventDefault()
  }

  const height = PAD_TOP + CARD_H + 56 + 64

  return (
    <div
      ref={root}
      role="region"
      aria-roledescription="carousel"
      aria-label="How it works"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(e) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
      className={cn(
        'relative isolate touch-pan-y select-none overflow-hidden border outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{ height }}
    >
      {geo && <Track geo={geo} progress={progress} reduce={reduce} />}

      <ol className="absolute inset-0">
        {geo &&
          steps.map((s, i) => (
            <StepCard
              key={`${i}-${geo.width}`}
              step={s}
              index={i}
              count={n}
              geo={geo}
              progress={progress}
              active={i === active}
              onSelect={() => goTo(i)}
            />
          ))}
      </ol>

      <div className="absolute inset-x-0 bottom-0 flex h-16 items-center justify-center gap-3">
        <button
          type="button"
          aria-label="Previous step"
          onClick={() => go(-1)}
          className="flex size-8 items-center justify-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === active ? 'step' : undefined}
              onClick={() => goTo(i)}
              className="flex h-6 items-center"
            >
              <motion.span
                className="relative block h-1.5 overflow-hidden rounded-full bg-foreground/20"
                animate={{ width: i === active ? 28 : 6 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', visualDuration: 0.3, bounce: 0.1 }}
              >
                {i === active && (
                  <motion.span
                    key={`${target}-${playing}`}
                    className="absolute inset-0 origin-left rounded-full bg-foreground"
                    initial={{ scaleX: playing ? 0 : 1 }}
                    animate={{ scaleX: 1 }}
                    transition={playing ? { duration: AUTO_MS / 1000, ease: 'linear' } : { duration: 0 }}
                  />
                )}
              </motion.span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next step"
          onClick={() => go(1)}
          className="flex size-8 items-center justify-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        Step {active + 1} of {n}: {steps[active]?.title}
      </p>
    </div>
  )
}

/** Une étape posée sur la piste : sa place suit l'arc, elle pivote avec lui et s'efface en s'éloignant. */
function StepCard({
  step,
  index,
  count,
  geo,
  progress,
  active,
  onSelect,
}: {
  step: TrackStep
  index: number
  count: number
  geo: Geometry
  progress: MotionValue<number>
  active: boolean
  onSelect: () => void
}) {
  const offset = useTransform(progress, (p) => wrap(index - p, count))
  const x = useTransform(offset, (o) => geo.radius * Math.sin(o * geo.step))
  const y = useTransform(offset, (o) => geo.radius * (1 - Math.cos(o * geo.step)))
  const rotate = useTransform(offset, (o) => (o * geo.step * 180) / Math.PI)
  const scale = useTransform(offset, (o) => 1 - 0.07 * Math.min(Math.abs(o), 1.5))
  // Les voisines restent opaques (la piste ne transparaît pas) mais assombries ; la carte opposée disparaît
  // avant de changer de côté.
  const opacity = useTransform(offset, (o) => Math.max(0, Math.min(1, (1.6 - Math.abs(o)) / 0.6)))
  const dim = useTransform(offset, (o) => 0.6 * Math.min(Math.abs(o), 1))
  const zIndex = useTransform(offset, (o) => 10 - Math.round(Math.abs(o) * 2))

  return (
    <motion.li
      aria-current={active ? 'step' : undefined}
      onClick={active ? undefined : onSelect}
      className={cn(
        'group/step absolute flex flex-col gap-4 overflow-hidden rounded-xl border p-5 shadow-lg transition-[background-color,border-color] duration-500',
        active ? 'border-foreground/25 bg-card' : 'cursor-pointer bg-card'
      )}
      style={{
        left: (geo.width - geo.cardW) / 2,
        top: PAD_TOP,
        width: geo.cardW,
        height: CARD_H,
        x,
        y,
        rotate,
        scale,
        opacity,
        zIndex,
        transformOrigin: `50% ${ANCHOR * 100}%`,
      }}
    >
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-1 bg-background" style={{ opacity: dim }} />
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-md border bg-background text-foreground [&>svg]:size-4.5">{step.icon}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">{step.visual}</div>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">{step.title}</h3>
        <p className="text-muted-foreground text-sm">{step.text}</p>
      </div>
    </motion.li>
  )
}

/**
 * La piste : couloirs concentriques (traits Arc fins, bordures plus marquées), une lueur au sommet sous l'étape
 * active, et les lignes de départ décalées par couloir qui défilent avec la position.
 */
function Track({ geo, progress, reduce }: { geo: Geometry; progress: MotionValue<number>; reduce: boolean }) {
  const cx = geo.width / 2
  const top = PAD_TOP + CARD_H * ANCHOR
  const cy = top + geo.radius
  const inner = geo.radius - (LANES * LANE_W) / 2
  const radii = Array.from({ length: LANES + 1 }, (_, i) => inner + i * LANE_W)
  const stepDeg = (geo.step * 180) / Math.PI
  const marks = useRef<SVGGElement>(null)

  // Le motif se répète à chaque étape : on ne tourne que de la fraction en cours, sans saut visible.
  useMotionValueEvent(progress, 'change', (p) => {
    marks.current?.setAttribute('transform', `rotate(${-(p - Math.floor(p)) * stepDeg} ${cx} ${cy})`)
  })
  useEffect(() => {
    const p = progress.get()
    marks.current?.setAttribute('transform', `rotate(${-(p - Math.floor(p)) * stepDeg} ${cx} ${cy})`)
  }, [progress, stepDeg, cx, cy])

  // Lignes de départ : une par étape visible, chaque couloir décalé vers l'avant comme un départ en virage.
  const span = Math.ceil(geo.width / 2 / geo.spacing) + 2
  const starts = Array.from({ length: span * 2 + 1 }, (_, k) => (k - span) * stepDeg)
  const ticks = Array.from({ length: (span * 2 + 1) * 6 }, (_, k) => (k / 6 - span) * stepDeg)
  const polar = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const
  }
  const comet = radii[3] + LANE_W / 2
  const circumference = 2 * Math.PI * comet

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-1 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_40%,black_45%,transparent_100%)]"
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--foreground)_10%,transparent),transparent)]"
        style={{ top: top - 170, width: Math.min(geo.width, 640), height: 340 }}
      />
      <svg className="absolute inset-0 size-full" width={geo.width} height="100%">
        <defs>
          <linearGradient id="track-glow" gradientUnits="userSpaceOnUse" x1={cx - geo.width / 2} x2={cx + geo.width / 2} y1="0" y2="0">
            <stop offset="0" stopColor="var(--foreground)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--foreground)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--foreground)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Surface de la piste */}
        <circle cx={cx} cy={cy} r={geo.radius} fill="none" stroke="var(--foreground)" strokeOpacity="0.035" strokeWidth={LANES * LANE_W} />
        {/* Couloirs */}
        {radii.map((r, i) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeOpacity={i === 0 || i === LANES ? 1 : 0.55}
            strokeWidth="1"
          />
        ))}
        {/* Lueur au sommet, sous l'étape active */}
        <circle cx={cx} cy={cy} r={radii[0]} fill="none" stroke="url(#track-glow)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={radii[LANES]} fill="none" stroke="url(#track-glow)" strokeWidth="1.5" />
        {/* Anneaux de fond, comme derrière la carte de connexion */}
        {[1, 2, 3].map((k) => (
          <circle key={k} cx={cx} cy={cy} r={radii[LANES] + k * 64} fill="none" stroke="var(--border)" strokeOpacity={0.5 - k * 0.12} strokeWidth="1" />
        ))}
        {[1, 2].map((k) => (
          <circle key={`i${k}`} cx={cx} cy={cy} r={radii[0] - k * 72} fill="none" stroke="var(--border)" strokeOpacity={0.4 - k * 0.12} strokeWidth="1" />
        ))}
        <g ref={marks}>
          {ticks.map((deg) => {
            const [x1, y1] = polar(radii[LANES] + 4, deg)
            const [x2, y2] = polar(radii[LANES] + 10, deg)
            return <line key={`t${deg}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border)" strokeWidth="1" />
          })}
          {starts.map((deg) =>
            radii.slice(0, LANES).map((r, lane) => {
              const d = deg + lane * 0.55 * (1150 / geo.radius)
              const [x1, y1] = polar(r, d)
              const [x2, y2] = polar(r + LANE_W, d)
              return <line key={`${deg}-${lane}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--foreground)" strokeOpacity="0.28" strokeWidth="1.5" />
            })
          )}
        </g>
        {/* Un coureur lumineux qui fait le tour du couloir 4 */}
        {!reduce && (
          <motion.circle
            cx={cx}
            cy={cy}
            r={comet}
            fill="none"
            stroke="url(#track-glow)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`90 ${circumference - 90}`}
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: -circumference }}
            transition={{ duration: 36, ease: 'linear', repeat: Infinity }}
          />
        )}
      </svg>
    </div>
  )
}
