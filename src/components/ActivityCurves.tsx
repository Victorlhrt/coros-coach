import { LineChart } from '@/components/arc/line-chart/line-chart'
import { PanelSection } from '@/components/raice/panel'
import { formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { smooth, type ActivityStream } from '@/lib/coros/stream'

/** Points affichés au plus : au-delà, le tracé n'est pas plus lisible et le survol devient lourd. */
const MAX_POINTS = 300
/** Sous cette vitesse (≈ 16:40 /km), arrêt ou marche : la courbe tombe à zéro, comme sur la montre. */
const MIN_SPEED = 1

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Moyenne de chaque paquet de `size` valeurs (null si aucune valeur). */
function bucket(values: (number | null)[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, i) => {
    const part = values.slice(i * size, (i + 1) * size).filter((v): v is number => v !== null)
    return part.length ? part.reduce((a, v) => a + v, 0) / part.length : null
  })
}

/** Allure et fréquence cardiaque au fil de la sortie (fichier FIT de la montre), axe en minutes de temps chronométré. */
export function ActivityCurves({ stream, units }: { stream: ActivityStream; units: Units }) {
  const size = Math.max(1, Math.ceil(stream.speed.length / MAX_POINTS))
  const step = stream.step * size
  const speed = bucket(smooth(stream.speed, stream.step, 15), size)
  const hr = bucket(stream.hr, size)
  const total = speed.length * step
  const tick = total > 75 * 60 ? 15 * 60 : total > 35 * 60 ? 10 * 60 : 5 * 60
  const hasSpeed = speed.some((v) => v !== null && v >= MIN_SPEED)
  const hasHr = hr.some((v) => v !== null)

  // Un trou (capteur décroché) garde la valeur d'avant : le graphique tracerait 0 pour une valeur absente.
  const series = (values: (number | null)[], key: string, floor = 0) => {
    let last = 0
    let next = tick
    return values.map((v, i) => {
      const t = i * step
      const mark = t >= next ? `${Math.round(next / 60)}` : undefined
      while (t >= next) next += tick
      if (v !== null) last = v < floor ? 0 : v
      return { key: String(i), label: minutes(t), axisLabel: i === 0 ? '0' : mark, values: { [key]: last } }
    })
  }

  const avgHr = hr.filter((v): v is number => v !== null)
  const maxHr = avgHr.length ? Math.max(...avgHr) : null
  const minute = smooth(stream.speed, stream.step, 60).filter((v): v is number => v !== null && v >= MIN_SPEED)
  const best = minute.length ? Math.max(...minute) : null

  if (!hasSpeed && !hasHr) return null
  return (
    <PanelSection divided className="grid gap-6">
      {hasSpeed && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
            <p className="font-medium text-foreground">Pace</p>
            {best && <p className="text-muted-foreground">Best minute <span className="text-foreground tabular-nums">{formatPace(1000 / best, units)} {paceUnit(units)}</span></p>}
          </div>
          <LineChart
            data={series(speed, 'speed', MIN_SPEED)}
            series={[{ key: 'speed', label: 'Pace', area: true }]}
            label="Pace over the run"
            height={160}
            curve="linear"
            categoryLabel="Time"
            formatValue={(v) => (v >= MIN_SPEED ? `${formatPace(1000 / v, units)} ${paceUnit(units)}` : 'Stopped')}
            formatTick={(v) => (v >= MIN_SPEED ? formatPace(1000 / v, units) : '')}
          />
        </div>
      )}
      {hasHr && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
            <p className="font-medium text-foreground">Heart rate</p>
            {maxHr && <p className="text-muted-foreground">Max <span className="text-foreground tabular-nums">{Math.round(maxHr)} bpm</span></p>}
          </div>
          <LineChart
            data={series(hr, 'hr')}
            series={[{ key: 'hr', label: 'Heart rate', area: true, color: '#e5484d' }]}
            label="Heart rate over the run"
            unit=" bpm"
            height={140}
            curve="smooth"
            categoryLabel="Time"
            formatValue={(v) => `${Math.round(v)}`}
          />
        </div>
      )}
      <p className="text-muted-foreground text-xs">Time in minutes, pauses removed{stream.pauses.length ? ` (${stream.pauses.length} pause${stream.pauses.length > 1 ? 's' : ''})` : ''}.</p>
    </PanelSection>
  )
}
