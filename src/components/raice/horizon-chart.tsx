import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Panel, PanelHeader, PanelSection, Segmented } from './panel'

/** Une série : écart signé (en %) à la référence, un point par période. */
export type HorizonSeries = { id: string; name: string; values: number[] }

export interface HorizonChartProps {
  title: string
  subtitle?: string
  series: HorizonSeries[]
  /** Libellés des points, même longueur que `values`. */
  pointLabels: string[]
  /** Amplitude max repliée ; par défaut max |valeur| arrondi au-dessus. */
  maxAbs?: number
  defaultBands?: 1 | 2 | 3 | 4
  format?: (v: number) => string
  className?: string
}

type SortKey = 'name' | 'peak' | 'last'
type BandKey = '1' | '2' | '3' | '4'

// Teintes du clair au foncé : bleus au-dessus, oranges en dessous.
const BLUES = ['#9cc3ef', '#5a9be0', '#2f7fd6', '#1e5fae']
const ORANGES = ['#f2c58a', '#eaa04a', '#e08a1e', '#b86a0d']
const PICK: Record<number, number[]> = { 1: [2], 2: [1, 3], 3: [0, 2, 3], 4: [0, 1, 2, 3] }

const VB_W = 1000
const VB_H = 44

const defaultFormat = (v: number) => {
  const r = Math.round(v)
  if (r === 0) return '0%'
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}%`
}

const fmtStep = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','))

/** Chemin d'aire pour la couche `k` (valeurs déjà ramenées au signe voulu, ≥ 0). */
function layerPath(values: number[], k: number, step: number): string {
  const n = values.length
  if (n === 0) return ''
  const x = (i: number) => (n === 1 ? VB_W / 2 : (i / (n - 1)) * VB_W)
  const y = (v: number) => VB_H - (Math.min(Math.max(v - k * step, 0), step) / step) * VB_H
  let d = `M${n === 1 ? 0 : x(0)},${VB_H}`
  if (n === 1) d += ` L0,${y(values[0])} L${VB_W},${y(values[0])}`
  else for (let i = 0; i < n; i++) d += ` L${x(i).toFixed(1)},${y(values[i]).toFixed(2)}`
  return `${d} L${n === 1 ? VB_W : x(n - 1)},${VB_H} Z`
}

/** Bande « horizon » d'une série : couches positives (bleu) et négatives (orange). */
function HorizonBand({ values, bands, step, animate }: { values: number[]; bands: number; step: number; animate: boolean }) {
  const pos = useMemo(() => values.map((v) => Math.max(v, 0)), [values])
  const neg = useMemo(() => values.map((v) => Math.max(-v, 0)), [values])
  const idx = PICK[bands]
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <motion.g
        key={bands}
        initial={animate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {idx.map((ci, k) => (
          <path key={`n${k}`} d={layerPath(neg, k, step)} fill={ORANGES[ci]} />
        ))}
        {idx.map((ci, k) => (
          <path key={`p${k}`} d={layerPath(pos, k, step)} fill={BLUES[ci]} />
        ))}
      </motion.g>
    </svg>
  )
}

/**
 * Graphique horizon (façon Arc) : chaque série est repliée en N bandes de couleur,
 * avec un réticule vertical synchronisé sur toutes les lignes.
 */
export function HorizonChart({ title, subtitle, series, pointLabels, maxAbs, defaultBands = 3, format = defaultFormat, className }: HorizonChartProps) {
  const reduce = useReducedMotion()
  const labelId = useId()
  const [sort, setSort] = useState<SortKey>('name')
  const [bands, setBands] = useState<BandKey>(String(defaultBands) as BandKey)
  const nPoints = useMemo(() => Math.max(pointLabels.length, ...series.map((s) => s.values.length), 0), [pointLabels, series])
  const [selected, setSelected] = useState<number | null>(null)
  const sel = Math.min(Math.max(selected ?? nPoints - 1, 0), Math.max(nPoints - 1, 0))
  const bandRef = useRef<HTMLDivElement | null>(null)

  const bandCount = Number(bands)
  const domain = useMemo(() => {
    if (maxAbs && maxAbs > 0) return maxAbs
    const m = Math.max(0, ...series.flatMap((s) => s.values.map((v) => Math.abs(v))))
    return m > 0 ? Math.ceil(m) : 1
  }, [maxAbs, series])
  const step = domain / bandCount

  const sorted = useMemo(() => {
    const arr = [...series]
    const last = (s: HorizonSeries) => s.values[s.values.length - 1] ?? 0
    const peak = (s: HorizonSeries) => Math.max(0, ...s.values.map(Math.abs))
    if (sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    else if (sort === 'peak') arr.sort((a, b) => peak(b) - peak(a))
    else arr.sort((a, b) => last(b) - last(a))
    return arr
  }, [series, sort])

  // Position du pointeur → indice du point le plus proche (sur la largeur des bandes).
  const onPointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const el = bandRef.current
      if (!el || nPoints < 2) return
      const r = el.getBoundingClientRect()
      const t = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
      setSelected(Math.round(t * (nPoints - 1)))
    },
    [nPoints],
  )

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setSelected(Math.max(sel - 1, 0))
    else if (e.key === 'ArrowRight') setSelected(Math.min(sel + 1, nPoints - 1))
    else if (e.key === 'Home') setSelected(0)
    else if (e.key === 'End') setSelected(nPoints - 1)
    else return
    e.preventDefault()
  }

  const xPct = nPoints < 2 ? 50 : (sel / (nPoints - 1)) * 100
  const swatches = [...PICK[bandCount].map((i) => ORANGES[i]).reverse(), ...PICK[bandCount].map((i) => BLUES[i])]

  return (
    <Panel className={className}>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<SortKey>
              label="Tri"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'name', label: 'Nom' },
                { value: 'peak', label: 'Pic' },
                { value: 'last', label: 'Dernier' },
              ]}
            />
            <Segmented<BandKey>
              label="Bandes"
              value={bands}
              onChange={setBands}
              options={(['1', '2', '3', '4'] as const).map((b) => ({ value: b, label: b }))}
            />
          </div>
        }
      />

      {series.length === 0 || nPoints === 0 ? (
        <PanelSection divided className="py-12 text-center text-muted-foreground text-sm">
          Aucune donnée à afficher pour l'instant.
        </PanelSection>
      ) : (
        <>
          <PanelSection className="flex flex-wrap items-end justify-between gap-6 pt-0">
            <div className="min-w-0">
              <p id={labelId} className="font-medium text-2xl tabular-nums tracking-tight" aria-live="polite">
                {pointLabels[sel] ?? `Point ${sel + 1}`}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">Point sélectionné</p>
            </div>
            <div className="w-full max-w-[340px]">
              <div className="flex gap-0.5 overflow-hidden rounded-md">
                {swatches.map((c, i) => (
                  <span key={i} className="h-3 flex-1" style={{ background: c }} />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-muted-foreground text-xs tabular-nums">
                <span>−{fmtStep(domain)}%</span>
                <span>Sous</span>
                <span>0</span>
                <span>Au-dessus</span>
                <span>+{fmtStep(domain)}%</span>
              </div>
              <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                Chaque ligne se replie en {bandCount} bande{bandCount > 1 ? 's' : ''} de {fmtStep(step)} %. Plus la couleur est forte, plus on
                s'éloigne de la référence.
              </p>
            </div>
          </PanelSection>

          <PanelSection divided>
            <div
              role="group"
              tabIndex={0}
              aria-labelledby={labelId}
              aria-roledescription="graphique horizon"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onKeyDown={onKey}
              className="flex touch-pan-y select-none flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sorted.map((s, row) => {
                const v = s.values[sel]
                return (
                  <motion.div
                    key={s.id}
                    layout={reduce ? false : 'position'}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="flex items-center gap-3 sm:gap-4"
                  >
                    <span className="w-24 shrink-0 truncate text-sm sm:w-40" title={s.name}>
                      {s.name}
                    </span>
                    <div ref={row === 0 ? bandRef : undefined} className="relative h-11 min-w-0 flex-1 overflow-hidden rounded-lg bg-foreground/[0.04]">
                      <HorizonBand values={s.values} bands={bandCount} step={step} animate={!reduce} />
                      <span className="pointer-events-none absolute inset-y-0 w-px bg-foreground/80" style={{ left: `${xPct}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm tabular-nums">{v === undefined ? '—' : format(v)}</span>
                  </motion.div>
                )
              })}
            </div>
          </PanelSection>
        </>
      )}
    </Panel>
  )
}
