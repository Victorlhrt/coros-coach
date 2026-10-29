import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { Panel, PanelHeader, PanelSection, Segmented } from './panel'

export type MetricPoint = { x: string; y: number }

export type Kpi = {
  id: string
  label: string
  value: string
  /** Variation affichée, ex. « 11.7% ». */
  delta?: string
  trend?: 'up' | 'down' | 'flat'
  /** Sens considéré comme favorable (vert). Par défaut « up ». */
  goodWhen?: 'up' | 'down'
  points: MetricPoint[]
  compare?: MetricPoint[]
  format?: (v: number) => string
  unit?: string
}

export type TopList = { title: string; columnLabel: string; rows: { label: string; value: number; display?: string }[] }

export interface MetricsDashboardProps {
  title: string
  subtitle?: string
  kpis: Kpi[]
  ranges?: { value: string; label: string }[]
  range?: string
  onRangeChange?: (v: string) => void
  lists?: TopList[]
  actions?: ReactNode
  compareLabel?: string
  emptyLabel?: string
  className?: string
}

/** Tableau de bord façon Arc « Metrics dashboard » : onglets KPI, courbe SVG, listes classées. */
export function MetricsDashboard({
  title,
  subtitle,
  kpis,
  ranges,
  range,
  onRangeChange,
  lists,
  actions,
  compareLabel = 'Comparer',
  emptyLabel = 'No data for this period yet.',
  className,
}: MetricsDashboardProps) {
  const [activeId, setActiveId] = useState(kpis[0]?.id)
  const [compare, setCompare] = useState(false)
  // Si la liste de KPI change et que l'onglet actif disparaît, on retombe sur le premier
  const active = kpis.find((k) => k.id === activeId) ?? kpis[0]

  const headerActions =
    (ranges && ranges.length > 0 && range !== undefined) || actions ? (
      <>
        {ranges && ranges.length > 0 && range !== undefined && (
          <Segmented value={range} options={ranges} onChange={(v) => onRangeChange?.(v)} label="Period" />
        )}
        {actions}
      </>
    ) : undefined

  return (
    <Panel className={className}>
      <PanelHeader title={title} subtitle={subtitle} actions={headerActions} />

      {kpis.length > 0 && (
        <div role="tablist" aria-label="Indicateurs" className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto border-t sm:grid" style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))` }}>
          {kpis.map((k, i) => (
            <KpiTab key={k.id} kpi={k} active={k.id === active?.id} first={i === 0} onClick={() => setActiveId(k.id)} />
          ))}
        </div>
      )}

      {active && (
        <PanelSection divided className="pt-4">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="h-0.5 w-4 rounded-full bg-foreground" />
                {active.label}
              </span>
              {compare && active.compare && active.compare.length > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="w-4 border-muted-foreground border-t border-dashed" />
                  {compareLabel}
                </span>
              )}
            </div>
            {active.compare && active.compare.length > 0 && (
              <label className="inline-flex cursor-pointer select-none items-center gap-2 text-muted-foreground hover:text-foreground">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="size-3.5 accent-foreground" />
                {compareLabel}
              </label>
            )}
          </div>
          <LineChart kpi={active} showCompare={compare} emptyLabel={emptyLabel} />
        </PanelSection>
      )}

      {lists && lists.length > 0 && (
        <div className={cn('grid border-t', lists.length > 1 && 'md:grid-cols-2')}>
          {lists.map((l, i) => (
            <TopListBlock key={l.title} list={l} className={cn(i > 0 && 'border-t md:border-t-0 md:border-l')} />
          ))}
        </div>
      )}
    </Panel>
  )
}

/* ---------- Onglets KPI ---------- */

function KpiTab({ kpi, active, first, onClick }: { kpi: Kpi; active: boolean; first: boolean; onClick: () => void }) {
  const trend = kpi.trend ?? 'flat'
  const good = kpi.goodWhen ?? 'up'
  const tone = trend === 'flat' ? 'text-muted-foreground' : trend === good ? 'text-emerald-400' : 'text-red-400'
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative w-[42%] shrink-0 snap-start px-6 py-4 text-left transition-colors sm:w-auto sm:min-w-0',
        !first && 'border-l',
        active ? 'bg-foreground/[0.04]' : 'hover:bg-foreground/[0.02]',
      )}
    >
      <div className="truncate text-muted-foreground text-sm">{kpi.label}</div>
      <div className="mt-1 truncate font-medium text-2xl tabular-nums tracking-tight">
        {kpi.value}
        {kpi.unit && <span className="ml-1 font-normal text-base text-muted-foreground">{kpi.unit}</span>}
      </div>
      {kpi.delta && (
        <div className={cn('mt-1 inline-flex items-center gap-1 text-sm tabular-nums', tone)}>
          <Icon className="size-3.5" aria-hidden />
          {kpi.delta}
        </div>
      )}
      {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />}
    </button>
  )
}

/* ---------- Graphique ---------- */

const H = 240
const PAD = { top: 12, right: 8, bottom: 28, left: 44 }

/** Pas « joli » (1, 2, 2.5, 5 × 10^n) pour ~4 graduations. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const d = Math.abs(min) || 1
    min -= d / 2
    max += d / 2
  }
  const raw = (max - min) / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  let lo = Math.floor(min / step) * step
  // Ancrage à zéro si les données sont positives et proches de 0
  if (min >= 0 && lo < 0) lo = 0
  const ticks: number[] = []
  for (let v = lo; ticks.length < count || ticks[ticks.length - 1] < max; v += step) {
    ticks.push(Number(v.toFixed(10)))
    if (ticks.length > 8) break
  }
  return ticks
}

/** Chemin cubique monotone (Fritsch–Carlson), sans dépassement entre les points. */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`
  const dx: number[] = []
  const s: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    s.push(dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  const m: number[] = [s[0]]
  for (let i = 1; i < n - 1; i++) m.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2)
  m.push(s[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / s[i]
    const b = m[i + 1] / s[i]
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      m[i] = t * a * s[i]
      m[i + 1] = t * b * s[i]
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${pts[i][0] + h},${pts[i][1] + m[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - m[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

const defaultFormat = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

export function LineChart({ kpi, showCompare, emptyLabel }: { kpi: Kpi; showCompare: boolean; emptyLabel: string }) {
  const reduce = useReducedMotion()
  const gradId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  // Largeur réelle du conteneur pour garder un texte net (pas de mise à l'échelle du SVG)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fmt = kpi.format ?? defaultFormat
  const points = kpi.points
  const cmp = showCompare && kpi.compare && kpi.compare.length > 0 ? kpi.compare : null

  const geo = useMemo(() => {
    if (points.length === 0) return null
    const ys = [...points.map((p) => p.y), ...(cmp ? cmp.map((p) => p.y) : [])]
    const ticks = niceTicks(Math.min(...ys), Math.max(...ys))
    const lo = ticks[0]
    const hi = ticks[ticks.length - 1]
    const iw = width - PAD.left - PAD.right
    const ih = H - PAD.top - PAD.bottom
    const n = Math.max(points.length, cmp?.length ?? 0)
    const sx = (i: number) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
    const sy = (v: number) => PAD.top + ih - ((v - lo) / (hi - lo || 1)) * ih
    const main = points.map((p, i) => [sx(i), sy(p.y)] as [number, number])
    const line = monotonePath(main)
    const area = main.length > 1 ? `${line}L${main[main.length - 1][0]},${PAD.top + ih}L${main[0][0]},${PAD.top + ih}Z` : ''
    const cmpLine = cmp ? monotonePath(cmp.map((p, i) => [sx(i), sy(p.y)])) : ''
    // Éclaircissement des étiquettes X : ~6 au maximum, moins sur un écran étroit (une tous les 70 px)
    const every = Math.max(1, Math.ceil(points.length / Math.min(6, Math.max(2, Math.floor(iw / 70)))))
    return { ticks, sx, sy, main, line, area, cmpLine, every, n, ih }
  }, [points, cmp, width])

  if (!geo) {
    return (
      <div ref={wrapRef} className="grid place-items-center rounded-2xl border border-dashed text-muted-foreground text-sm" style={{ height: H }}>
        {emptyLabel}
      </div>
    )
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const iw = width - PAD.left - PAD.right
    const i = points.length <= 1 ? 0 : Math.round(((x - PAD.left) / iw) * (geo.n - 1))
    setHover(Math.min(points.length - 1, Math.max(0, i)))
  }

  const hp = hover !== null ? points[hover] : null
  const hx = hover !== null ? geo.main[hover][0] : 0
  const hy = hover !== null ? geo.main[hover][1] : 0
  const cmpVal = hover !== null && cmp ? cmp[hover] : undefined

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width={width}
        height={H}
        className="block touch-pan-y select-none"
        role="img"
        aria-label={`${kpi.label} : ${points.map((p) => `${p.x} ${fmt(p.y)}`).join(', ')}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.14} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grille horizontale + graduations */}
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={geo.sy(t)} y2={geo.sy(t)} className="stroke-border" strokeDasharray={t === geo.ticks[0] ? undefined : '3 4'} />
            <text x={PAD.left - 10} y={geo.sy(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {fmt(t)}
            </text>
          </g>
        ))}

        {/* Étiquettes X */}
        {points.map((p, i) => {
          const last = points.length - 1
          // Dernière étiquette ajoutée seulement si elle ne chevauche pas la précédente
          const show = i % geo.every === 0 || (i === last && last % geo.every >= geo.every * 0.75)
          if (!show) return null
          const anchor = points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === last ? 'end' : 'middle'
          return (
            <text key={`${p.x}-${i}`} x={geo.sx(i)} y={H - 8} textAnchor={anchor} className="fill-muted-foreground text-[11px]">
              {p.x}
            </text>
          )
        })}

        <g className="text-foreground">
          {geo.area && <path d={geo.area} fill={`url(#${gradId})`} />}
          {geo.cmpLine && <path d={geo.cmpLine} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="4 4" />}
          <path
            key={`${kpi.id}-${points.length}`}
            d={geo.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={reduce ? undefined : 1}
            style={reduce ? undefined : { strokeDashoffset: 1, animation: 'raice-draw 700ms ease-out forwards' }}
          />
          {points.length === 1 && <circle cx={geo.main[0][0]} cy={geo.main[0][1]} r={3.5} fill="currentColor" />}
        </g>

        {/* Réticule au survol */}
        {hp && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + geo.ih} className="stroke-foreground/30" />
            <circle cx={hx} cy={hy} r={4.5} className="fill-card stroke-foreground" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(hx, 70), width - 70), top: Math.max(0, hy - 64), transform: 'translateX(-50%)' }}
        >
          <div className="text-muted-foreground">{hp.x}</div>
          <div className="font-medium tabular-nums">
            {fmt(hp.y)}
            {kpi.unit && <span className="ml-0.5 text-muted-foreground">{kpi.unit}</span>}
          </div>
          {cmpVal && <div className="text-muted-foreground tabular-nums">vs {fmt(cmpVal.y)}</div>}
        </div>
      )}
      <style>{'@keyframes raice-draw{to{stroke-dashoffset:0}}'}</style>
    </div>
  )
}

/* ---------- Listes classées ---------- */

function TopListBlock({ list, className }: { list: TopList; className?: string }) {
  const max = Math.max(0, ...list.rows.map((r) => r.value))
  return (
    <div className={cn('min-w-0 px-6 py-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <h3 className="font-medium">{list.title}</h3>
        <span className="text-muted-foreground">{list.columnLabel}</span>
      </div>
      <ul className="space-y-1">
        {list.rows.map((r, i) => (
          <li key={`${r.label}-${i}`} className="flex items-center gap-3 text-sm">
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
              <span aria-hidden className="absolute inset-y-0 left-0 rounded-md bg-foreground/[0.07]" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
              <span className="relative block truncate px-2.5 py-1.5">{r.label}</span>
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums">{r.display ?? defaultFormat(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
