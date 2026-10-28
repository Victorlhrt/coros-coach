import { LineChart } from '@/components/arc/line-chart/line-chart'
import { formatDuration, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { flatten } from '@/lib/coach/metrics'
import type { Block, Zone } from '@/lib/coach/schema'
import { STEP_LABEL } from '@/lib/coach/ui'
import { ZONE_NAMES } from '@/lib/coach/zones'

const SERIES = [{ key: 'zone', label: 'Intensity', area: true }]
const SAMPLES = 160

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Profil d'intensité de la séance (Arc LineChart) : zone visée minute par minute, survol pour l'étape et l'allure. */
export function SessionProfileChart({ blocks, zones, units, className }: { blocks: Block[]; zones: Zone[]; units: Units; className?: string }) {
  const steps = flatten(blocks, zones)
  const total = steps.reduce((a, s) => a + s.seconds, 0)
  if (!total) return null
  const tick = total > 75 * 60 ? 15 * 60 : total > 35 * 60 ? 10 * 60 : 5 * 60
  let next = tick
  let i = 0
  let end = steps[0].seconds
  const data = Array.from({ length: SAMPLES + 1 }, (_, n) => {
    const t = (n / SAMPLES) * total
    while (t >= end && i < steps.length - 1) end += steps[++i].seconds
    const s = steps[i]
    const mark = t >= next ? formatDuration(next) : undefined
    while (t >= next) next += tick
    const z = zones.find((z) => z.zone === s.zone)
    const [fast, slow] = s.paceFast && s.paceSlow ? [s.paceFast, s.paceSlow] : z ? [z.paceFast, z.paceSlow] : []
    const pace = fast && slow ? `${formatPace(fast, units)}–${formatPace(slow, units)} ${paceUnit(units)}` : null
    return {
      key: String(n),
      label: `${clock(t)} · ${STEP_LABEL[s.kind]}${s.rep ? ` ${s.rep}` : ''}${pace ? ` · ${pace}` : ''}`,
      axisLabel: n === 0 ? '0' : mark,
      values: { zone: s.zone },
    }
  })
  return (
    <LineChart
      className={className}
      data={data}
      series={SERIES}
      label="Session intensity profile"
      height={180}
      max={6}
      legend={false}
      curve="linear"
      categoryLabel="Time"
      formatValue={(v) => `Z${v} ${ZONE_NAMES[v] ?? ''}`}
      formatTick={(v) => (v > 0 && v <= 6 && Number.isInteger(v) ? `Z${v}` : '')}
    />
  )
}
