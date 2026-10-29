import { LineChart } from '@/components/arc/line-chart/line-chart'
import { formatDuration, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { flatten } from '@/lib/coach/metrics'
import type { Block, Zone } from '@/lib/coach/schema'
import type { Lap } from '@/lib/coros/laps'
import { STEP_LABEL } from '@/lib/coach/ui'
import { ZONE_NAMES } from '@/lib/coach/zones'

const SERIES = [{ key: 'zone', label: 'Planned', area: true }]
const SERIES_ACTUAL = [...SERIES, { key: 'actual', label: 'Actual', area: false, color: 'var(--foreground)' }]
const SAMPLES = 160

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/**
 * Allure → position sur l'échelle des zones, en continu : le milieu de la plage d'allure d'une zone vaut la zone,
 * ses bornes ±0,5. Entre deux plages (trous), on prend la zone la plus proche.
 */
export function paceToZone(pace: number, zones: Zone[]) {
  const sorted = [...zones].sort((a, b) => a.zone - b.zone)
  if (!sorted.length) return undefined
  let best = sorted[0]
  let bestGap = Infinity
  for (const z of sorted) {
    const gap = pace < z.paceFast ? z.paceFast - pace : pace > z.paceSlow ? pace - z.paceSlow : 0
    if (gap < bestGap) [best, bestGap] = [z, gap]
  }
  const span = Math.max(1, best.paceSlow - best.paceFast)
  const v = best.zone - 0.5 + (best.paceSlow - pace) / span
  return Math.round(Math.min(6.5, Math.max(0.5, v)) * 100) / 100
}

/** Profil d'intensité de la séance (Arc LineChart) : zone visée minute par minute, survol pour l'étape et l'allure. Avec les tours de l'activité liée, la courbe réelle se superpose à la théorique. */
export function SessionProfileChart({ blocks, zones, units, laps, className }: { blocks: Block[]; zones: Zone[]; units: Units; laps?: Lap[]; className?: string }) {
  const steps = flatten(blocks, zones)
  const planned = steps.reduce((a, s) => a + s.seconds, 0)
  if (!planned) return null
  // Tours réels cumulés dans le temps (on ignore ceux sans allure ni durée).
  const real = (laps ?? []).filter((l) => l.seconds && l.paceSecPerKm)
  let acc = 0
  const lapEnds = real.map((l) => (acc += l.seconds ?? 0))
  const realTotal = acc
  const total = Math.max(planned, realTotal)
  const tick = total > 75 * 60 ? 15 * 60 : total > 35 * 60 ? 10 * 60 : 5 * 60
  let next = tick
  let i = 0
  let end = steps[0].seconds
  const data = Array.from({ length: SAMPLES + 1 }, (_, n) => {
    const t = (n / SAMPLES) * total
    while (t >= end && i < steps.length - 1) end += steps[++i].seconds
    const s = steps[i]
    const inPlan = t <= planned
    // Au-delà de la fin d'une courbe, on garde sa dernière valeur (le graphique trace 0 pour une valeur absente).
    const lapIdx = real.length ? (t <= realTotal ? lapEnds.findIndex((e) => t <= e) : real.length - 1) : -1
    const lap = lapIdx >= 0 ? real[lapIdx] : null
    const mark = t >= next ? formatDuration(next) : undefined
    while (t >= next) next += tick
    const z = zones.find((z) => z.zone === s.zone)
    const [fast, slow] = s.paceFast && s.paceSlow ? [s.paceFast, s.paceSlow] : z ? [z.paceFast, z.paceSlow] : []
    const pace = fast && slow ? `${formatPace(fast, units)}–${formatPace(slow, units)} ${paceUnit(units)}` : null
    const planLabel = inPlan ? `${STEP_LABEL[s.kind]}${s.rep ? ` ${s.rep}` : ''}${pace ? ` · ${pace}` : ''}` : 'after the plan'
    const lapLabel = lap && t <= realTotal ? ` · lap ${lap.index}: ${formatPace(lap.paceSecPerKm!, units)} ${paceUnit(units)}${lap.avgHr ? `, ${Math.round(lap.avgHr)} bpm` : ''}` : ''
    return {
      key: String(n),
      label: `${clock(t)} · ${planLabel}${lapLabel}`,
      axisLabel: n === 0 ? '0' : mark,
      values: { zone: s.zone, actual: lap ? paceToZone(lap.paceSecPerKm!, zones) : undefined },
    }
  })
  const withActual = real.length > 0
  return (
    <LineChart
      className={className}
      data={data}
      series={withActual ? SERIES_ACTUAL : SERIES}
      label={withActual ? 'Planned and actual intensity' : 'Session intensity profile'}
      height={withActual ? 200 : 180}
      max={withActual ? 6.5 : 6}
      legend={withActual}
      curve="linear"
      categoryLabel="Time"
      formatValue={(v) => `Z${v} ${ZONE_NAMES[v] ?? ''}`}
      formatTick={(v) => (v > 0 && v <= 6 && Number.isInteger(v) ? `Z${v}` : '')}
    />
  )
}
