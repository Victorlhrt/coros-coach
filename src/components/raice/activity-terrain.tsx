import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { Panel, PanelHeader, PanelSection, Segmented } from './panel'

/** Une métrique affichable : grille de valeurs [ligne][colonne] et son format. */
export interface TerrainMetric {
  id: string
  label: string
  values: number[][]
  format: (v: number) => string
}

/** Statistique de pied de panneau (grande valeur + détail ou liste). */
export interface TerrainStat {
  label: string
  value: string
  detail?: string
  list?: { label: string; value: string }[]
}

export interface ActivityTerrainProps {
  title: string
  subtitle?: string
  rowLabels: string[]
  colLabels: string[]
  metrics: TerrainMetric[]
  stats?: TerrainStat[]
  hint?: string
  className?: string
}

type View = 'persp' | 'top'

// Géométrie (px, avant mise à l'échelle).
const GAP = 3
const MAX_H = 64
const LABEL_W = 40
const LABEL_H = 22
const PAD = 16
const ANGLES: Record<View, { rx: number; rz: number }> = { persp: { rx: 58, rz: -38 }, top: { rx: 0, rz: 0 } }

/** Gris : plus la valeur est forte, plus la face ressort du fond sombre. */
const shade = (t: number, k = 1) => `hsl(0 0% ${((14 + 74 * t) * k).toFixed(1)}%)`

/** Boîte englobante projetée (sans perspective) du plateau tourné. */
function projectBox(w: number, h: number, zMax: number, rx: number, rz: number) {
  const a = (rz * Math.PI) / 180
  const b = (rx * Math.PI) / 180
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const x of [-LABEL_W, w]) {
    for (const y of [0, h + LABEL_H]) {
      for (const z of [0, zMax]) {
        const px = x - w / 2
        const py = y - h / 2
        const x1 = px * Math.cos(a) - py * Math.sin(a)
        const y1 = px * Math.sin(a) + py * Math.cos(a)
        const y2 = y1 * Math.cos(b) - z * Math.sin(b)
        minX = Math.min(minX, x1)
        maxX = Math.max(maxX, x1)
        minY = Math.min(minY, y2)
        maxY = Math.max(maxY, y2)
      }
    }
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/** Une barre : face supérieure + faces sud et ouest, plus sombres. */
const Bar = memo(function Bar({ r, c, size, h, t, active, anim }: { r: number; c: number; size: number; h: number; t: number; active: boolean; anim: boolean }) {
  const b = size - GAP
  const z = active ? h + 6 : h
  const tr = anim ? 'transform 600ms cubic-bezier(.2,.7,.2,1), height 600ms cubic-bezier(.2,.7,.2,1), width 600ms cubic-bezier(.2,.7,.2,1), background-color 200ms' : undefined
  return (
    <div data-cell={`${r}:${c}`} className="absolute" style={{ left: c * size, top: r * size, width: b, height: b, transformStyle: 'preserve-3d' }}>
      <div
        className="absolute"
        style={{ left: 0, top: b, width: b, height: z, transformOrigin: 'top', transform: 'rotateX(90deg)', background: shade(t, 0.7), transition: tr }}
      />
      <div
        className="absolute"
        style={{ left: 0, top: 0, width: z, height: b, transformOrigin: 'left', transform: 'rotateY(-90deg)', background: shade(t, 0.5), transition: tr }}
      />
      <div
        data-top
        className="absolute inset-0 rounded-[2px]"
        style={{
          transform: `translateZ(${z}px)`,
          background: active ? '#fff' : shade(t),
          boxShadow: active ? '0 0 0 1.5px var(--color-background)' : undefined,
          transition: tr,
        }}
      />
    </div>
  )
})

/**
 * Terrain d'activité (façon Arc) : grille lignes × colonnes en barres 3D isométriques (CSS 3D),
 * bascule en carte de chaleur « Vue de dessus ».
 */
export function ActivityTerrain({ title, subtitle, rowLabels, colLabels, metrics, stats, hint, className }: ActivityTerrainProps) {
  const reduce = useReducedMotion() ?? false
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? '')
  const [view, setView] = useState<View>('persp')
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [wrapW, setWrapW] = useState(0)

  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0]
  const rows = rowLabels.length
  const cols = colLabels.length
  const size = cols <= 12 ? 34 : 22
  const gridW = cols * size
  const gridH = rows * size
  const labelEvery = Math.max(1, Math.ceil(cols / 9))

  const max = useMemo(() => {
    if (!metric) return 1
    const m = Math.max(0, ...metric.values.flat().filter(Number.isFinite))
    return m > 0 ? m : 1
  }, [metric])

  // Mise à l'échelle pour tenir dans la largeur disponible.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWrapW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { rx, rz } = ANGLES[view]
  const box = useMemo(() => projectBox(gridW, gridH, view === 'persp' ? MAX_H : 0, rx, rz), [gridW, gridH, view, rx, rz])
  const stageW = box.width + PAD * 2
  const stageH = box.height + PAD * 2
  const scale = wrapW > 0 ? Math.min(1, wrapW / stageW) : 1
  const anim = !reduce
  const ease = 'cubic-bezier(.2,.7,.2,1)'

  const onOver = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
      const wrap = wrapRef.current
      if (!cell || !wrap) return
      const [r, c] = (cell.dataset.cell ?? '').split(':').map(Number)
      const top = cell.querySelector<HTMLElement>('[data-top]') ?? cell
      const a = top.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      setHover((prev) => (prev && prev.r === r && prev.c === c ? prev : { r, c, x: a.left + a.width / 2 - w.left, y: a.top - w.top }))
    },
    [],
  )

  if (!metric || rows === 0 || cols === 0) {
    return (
      <Panel className={className}>
        <PanelHeader title={title} subtitle={subtitle} />
        <PanelSection divided className="py-12 text-center text-muted-foreground text-sm">
          Aucune activité à afficher pour l'instant.
        </PanelSection>
      </Panel>
    )
  }

  const hv = hover ? metric.values[hover.r]?.[hover.c] : undefined
  const statCols = Math.min(stats?.length ?? 0, 3)

  return (
    <Panel className={className}>
      <PanelHeader title={title} subtitle={subtitle} />
      <PanelSection className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <Segmented label="Métrique" value={metric.id} onChange={setMetricId} options={metrics.map((m) => ({ value: m.id, label: m.label }))} />
        <Segmented<View>
          label="Vue"
          value={view}
          onChange={(v) => {
            setHover(null)
            setView(v)
          }}
          options={[
            { value: 'persp', label: 'Perspective' },
            { value: 'top', label: 'Vue de dessus' },
          ]}
        />
      </PanelSection>

      <PanelSection className="pt-0">
        <div
          ref={wrapRef}
          className="relative w-full overflow-hidden"
          style={{ height: stageH * scale, transition: anim ? `height 600ms ${ease}` : undefined }}
        >
          <div
            className="absolute top-0"
            style={{
              width: stageW,
              height: stageH,
              left: Math.max(0, (wrapW - stageW * scale) / 2),
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              perspective: 1800,
            }}
          >
            <div
              role="img"
              aria-label={`${title} — ${metric.label}`}
              onPointerOver={onOver}
              onPointerLeave={() => setHover(null)}
              className="absolute"
              style={{
                width: gridW,
                height: gridH,
                left: -box.minX + PAD - gridW / 2,
                top: -box.minY + PAD - gridH / 2,
                transformStyle: 'preserve-3d',
                transform: `rotateX(${rx}deg) rotateZ(${rz}deg)`,
                transition: anim ? `transform 600ms ${ease}, left 600ms ${ease}, top 600ms ${ease}` : undefined,
              }}
            >
              {rowLabels.map((l, r) => (
                <span
                  key={`r${r}`}
                  className="absolute flex items-center justify-end pr-2 text-[11px] text-muted-foreground"
                  style={{ left: -LABEL_W, top: r * size, width: LABEL_W, height: size - GAP }}
                >
                  {l}
                </span>
              ))}
              {colLabels.map((l, c) =>
                c % labelEvery === 0 ? (
                  <span
                    key={`c${c}`}
                    className="absolute whitespace-nowrap text-center text-[11px] text-muted-foreground tabular-nums"
                    style={{ left: c * size + (size - GAP) / 2, top: gridH + 4, transform: 'translateX(-50%)' }}
                  >
                    {l}
                  </span>
                ) : null,
              )}
              {metric.values.slice(0, rows).map((row, r) =>
                row.slice(0, cols).map((v, c) => {
                  const t = Number.isFinite(v) ? Math.min(Math.max(v / max, 0), 1) : 0
                  return (
                    <Bar
                      key={`${r}:${c}`}
                      r={r}
                      c={c}
                      size={size}
                      t={t}
                      h={view === 'persp' ? t * MAX_H : 0}
                      active={hover?.r === r && hover?.c === c}
                      anim={anim}
                    />
                  )
                }),
              )}
            </div>
          </div>

          {hover && hv !== undefined && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-lg"
              style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, calc(-100% - 8px))' }}
            >
              <span className="text-muted-foreground">
                {rowLabels[hover.r]} · {colLabels[hover.c]} ·{' '}
              </span>
              <span className="font-medium tabular-nums">{metric.format(hv)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
          <div className="flex items-center gap-2">
            <span>Moins</span>
            <div className="flex gap-1">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => (
                <span key={t} className="size-3 rounded-[3px]" style={{ background: shade(t) }} />
              ))}
            </div>
            <span>Plus</span>
          </div>
          {hint && <p className="text-right">{hint}</p>}
        </div>
      </PanelSection>

      {statCols > 0 && stats && (
        <PanelSection
          divided
          className={cn('grid grid-cols-1 gap-6', statCols === 2 && 'sm:grid-cols-2', statCols === 3 && 'sm:grid-cols-3')}
        >
          {stats.slice(0, 3).map((s) => (
            <div key={s.label} className="min-w-0">
              <p className="text-muted-foreground text-sm">{s.label}</p>
              <p className="mt-1 font-medium text-2xl tabular-nums tracking-tight">{s.value}</p>
              {s.detail && <p className="mt-1 text-muted-foreground text-xs tabular-nums">{s.detail}</p>}
              {s.list && s.list.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {s.list.map((it) => (
                    <li key={it.label} className="flex justify-between gap-3">
                      <span className="truncate text-muted-foreground">{it.label}</span>
                      <span className="tabular-nums">{it.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </PanelSection>
      )}
    </Panel>
  )
}
