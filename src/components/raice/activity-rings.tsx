import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type Ring = { id: string; label: string; detail: string; /** 1 = 100 % */ value: number; color: string }
export type DayRings = { key: string; label: string; /** même ordre que `rings` */ values: number[]; isToday?: boolean }

export interface ActivityRingsProps {
  rings: Ring[]
  /** 0..1+, par défaut la moyenne des anneaux */
  centerValue?: number
  centerCaption?: string
  days?: DayRings[]
  selectedDay?: string
  onSelectDay?: (key: string) => void
  /** Diamètre du graphique en px (240 par défaut) */
  size?: number
  className?: string
}

const TICKS = 56
const TRACK = 'rgb(255 255 255 / 0.08)'
const EASE = [0.22, 1, 0.36, 1] as const

/** Interpole une liste de nombres de leur valeur affichée vers la cible (instantané si mouvement réduit). */
function useTweened(targets: number[], instant: boolean, duration = 1.2): number[] {
  const key = JSON.stringify(targets)
  const [values, setValues] = useState<number[]>(() => targets.map(() => 0))
  const current = useRef(values)

  useEffect(() => {
    if (instant) return
    const to = JSON.parse(key) as number[]
    const from = to.map((_, i) => current.current[i] ?? 0)
    const controls = animate(0, 1, {
      duration,
      ease: EASE,
      onUpdate: (t) => {
        const next = to.map((v, i) => from[i] + (v - from[i]) * t)
        current.current = next
        setValues(next)
      },
    })
    return () => controls.stop()
  }, [key, instant, duration])

  return instant ? targets : values
}

const pct = (v: number) => Math.round(v * 100)

/**
 * Anneaux d'activité façon Arc : anneaux concentriques en graduations, pourcentage central qui défile,
 * légende à droite (dessous en mobile) et rangée optionnelle de mini-anneaux par jour.
 * Au-delà de 100 %, le surplus repart pour un second tour plus clair sur le même anneau.
 */
export function ActivityRings({ rings, centerValue, centerCaption = 'de la semaine', days, selectedDay, onSelectDay, size = 240, className }: ActivityRingsProps) {
  const reduce = useReducedMotion() ?? false
  const list = rings.slice(0, 3)
  const center = centerValue ?? (list.length ? list.reduce((s, r) => s + r.value, 0) / list.length : 0)
  const tweened = useTweened([...list.map((r) => Math.max(0, r.value)), Math.max(0, center)], reduce)
  const shownCenter = tweened[list.length] ?? 0

  // Géométrie des graduations, recalculée seulement si la taille ou le nombre d'anneaux change.
  const geometry = useMemo(() => {
    const tickLen = size * 0.06
    const gap = size * 0.035
    const outer = size / 2 - size * 0.02 - tickLen / 2
    return Array.from({ length: list.length }, (_, i) => {
      const r = outer - i * (tickLen + gap)
      const n = Math.max(24, Math.round((TICKS * r) / outer))
      const ticks = Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2 - Math.PI / 2
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        return { x1: size / 2 + cos * (r - tickLen / 2), y1: size / 2 + sin * (r - tickLen / 2), x2: size / 2 + cos * (r + tickLen / 2), y2: size / 2 + sin * (r + tickLen / 2) }
      })
      return { n, ticks }
    })
  }, [size, list.length])

  const strokeWidth = Math.max(2, size * 0.011)
  const summary = `${pct(center)} % ${centerCaption}. ` + list.map((r) => `${r.label} : ${pct(r.value)} % (${r.detail})`).join(', ')

  return (
    <div className={cn('flex min-w-0 flex-col gap-6', className)}>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <div role="img" aria-label={summary} className="relative aspect-square max-w-full shrink-0" style={{ width: size }}>
          <svg viewBox={`0 0 ${size} ${size}`} className="block size-full" aria-hidden="true">
            {geometry.map(({ n, ticks }, i) => {
              const ring = list[i]
              const v = tweened[i] ?? 0
              const lap1 = Math.round(Math.min(v, 1) * n)
              const lap2 = Math.round(Math.min(Math.max(v - 1, 0), 1) * n)
              const bright = `color-mix(in srgb, ${ring.color} 60%, white)`
              return (
                <g key={ring.id} strokeLinecap="round" strokeWidth={strokeWidth}>
                  {ticks.map((t, k) => (
                    <line key={k} {...t} style={{ stroke: k < lap2 ? bright : k < lap1 ? ring.color : TRACK }} />
                  ))}
                </g>
              )
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="font-medium leading-none tracking-tight tabular-nums" style={{ fontSize: size * 0.17 }}>
              {pct(shownCenter)}
              <span className="ml-0.5 align-top text-muted-foreground" style={{ fontSize: size * 0.075 }}>
                %
              </span>
            </p>
            {centerCaption && (
              <p className="mt-1.5 text-muted-foreground" style={{ fontSize: Math.max(11, size * 0.05) }}>
                {centerCaption}
              </p>
            )}
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-4">
          {list.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3">
              <span aria-hidden="true" className="h-9 w-1 shrink-0 rounded-full" style={{ background: r.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{r.label}</p>
                <p className="truncate text-muted-foreground text-xs tabular-nums">{r.detail}</p>
              </div>
              <span className="shrink-0 font-medium text-sm tabular-nums">{pct(tweened[i] ?? 0)} %</span>
            </li>
          ))}
        </ul>
      </div>

      {days && days.length > 0 && (
        <div className="grid grid-cols-7 gap-1 border-t pt-4">
          {days.map((d) => {
            const selected = d.key === selectedDay
            const highlighted = selectedDay ? selected : !!d.isToday
            return (
              <button
                key={d.key}
                type="button"
                aria-pressed={selected}
                aria-label={`${d.label} : ` + list.map((r, i) => `${r.label} ${pct(d.values[i] ?? 0)} %`).join(', ')}
                onClick={() => onSelectDay?.(d.key)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl py-2 outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring',
                  selected && 'bg-foreground/[0.06]',
                )}
              >
                <MiniRings values={d.values} colors={list.map((r) => r.color)} />
                <span className={cn('text-xs', highlighted ? 'font-medium text-foreground' : 'text-muted-foreground')}>{d.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Petit donut à 3 arcs pleins pour la rangée des jours. */
function MiniRings({ values, colors }: { values: number[]; colors: string[] }) {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      {colors.map((color, i) => {
        const r = 13.5 - i * 4
        const v = Math.min(Math.max(values[i] ?? 0, 0), 1)
        return (
          <g key={i} fill="none" strokeWidth={3}>
            <circle cx={16} cy={16} r={r} style={{ stroke: TRACK }} />
            {v > 0 && (
              <circle cx={16} cy={16} r={r} pathLength={1} strokeDasharray={`${v} 1`} strokeLinecap={v < 1 ? 'round' : 'butt'} transform="rotate(-90 16 16)" style={{ stroke: color }} />
            )}
          </g>
        )
      })}
    </svg>
  )
}
