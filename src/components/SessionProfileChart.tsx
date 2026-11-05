import { LineChart } from '@/components/arc/line-chart/line-chart'
import { formatDuration, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { flatten } from '@/lib/coach/metrics'
import type { Block, Zone } from '@/lib/coach/schema'
import type { Lap } from '@/lib/coros/laps'
import { smooth, type ActivityStream } from '@/lib/coros/stream'
import { STEP_LABEL } from '@/lib/coach/ui'
import { ZONE_NAMES } from '@/lib/coach/zones'

const SERIES = [{ key: 'zone', label: 'Planned', area: true }]
/** Courbe réelle : verte si la séance est tenue (ou mieux), orange sinon. */
const ACTUAL_COLOR = { good: '#43b581', off: '#f2a33a' } as const
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

/** Inverse de paceToZone : position sur l'échelle des zones → allure (s/km), pour l'infobulle. */
function zoneToPace(v: number, zones: Zone[]) {
  const z = zones.find((x) => x.zone === Math.min(6, Math.max(1, Math.round(v))))
  if (!z) return null
  return z.paceSlow - (v - z.zone + 0.5) * Math.max(1, z.paceSlow - z.paceFast)
}

/** Sous cette vitesse (≈ 16:40 /km), le coureur est arrêté ou marche : pas d'allure à placer sur l'échelle. */
const MIN_SPEED = 1

/**
 * Profil d'intensité de la séance (Arc LineChart) : zone visée minute par minute, survol pour l'étape et l'allure.
 * Avec l'activité liée, la courbe réelle se superpose à la théorique : allure seconde par seconde (fichier FIT, lissée
 * sur 30 s) quand elle est disponible, sinon allure de chaque tour.
 */
export function SessionProfileChart({ blocks, zones, units, laps, stream, className }: { blocks: Block[]; zones: Zone[]; units: Units; laps?: Lap[]; stream?: ActivityStream | null; className?: string }) {
  const steps = flatten(blocks, zones)
  const planned = steps.reduce((a, s) => a + s.seconds, 0)
  if (!planned) return null
  const speeds = stream?.speed.some((v) => v !== null) ? smooth(stream.speed, stream.step, 30) : null
  // Tours réels cumulés dans le temps (on ignore ceux sans allure ni durée), seulement sans courbe seconde par seconde.
  const real = speeds ? [] : (laps ?? []).filter((l) => l.seconds && l.paceSecPerKm)
  let acc = 0
  const lapEnds = real.map((l) => (acc += l.seconds ?? 0))
  const realTotal = speeds && stream ? speeds.length * stream.step : acc
  let lastActual: number | undefined
  // Courbe seconde par seconde : deux fois plus de points pour garder le dessin des répétitions.
  const samples = speeds ? SAMPLES * 2 : SAMPLES
  const total = Math.max(planned, realTotal)
  const tick = total > 75 * 60 ? 15 * 60 : total > 35 * 60 ? 10 * 60 : 5 * 60
  let next = tick
  let i = 0
  let end = steps[0].seconds
  const data = Array.from({ length: samples + 1 }, (_, n) => {
    const t = (n / samples) * total
    while (t >= end && i < steps.length - 1) end += steps[++i].seconds
    const s = steps[i]
    const inPlan = t <= planned
    // Au-delà de la fin d'une courbe, on garde sa dernière valeur (le graphique trace 0 pour une valeur absente).
    const lapIdx = real.length ? (t <= realTotal ? lapEnds.findIndex((e) => t <= e) : real.length - 1) : -1
    const lap = lapIdx >= 0 ? real[lapIdx] : null
    const mark = t >= next ? formatDuration(next) : undefined
    while (t >= next) next += tick
    // Libellé court pour que l'infobulle reste dans la carte : l'allure réelle est dans les valeurs.
    const planLabel = inPlan ? `${STEP_LABEL[s.kind]}${s.rep ? ` ${s.rep}` : ''}` : 'After the plan'
    let actual: number | undefined
    let realLabel = ''
    if (speeds && stream) {
      const k = Math.min(speeds.length - 1, Math.floor(t / stream.step))
      const v = speeds[k]
      // Arrêt (feu, pause) : la courbe tombe en bas de l'échelle plutôt que de garder l'allure d'avant.
      actual = v !== null && v >= MIN_SPEED ? paceToZone(1000 / v, zones) : v !== null ? 0.5 : lastActual
      lastActual = actual
      const hr = stream.hr[k]
      realLabel = t <= realTotal && hr ? ` · ${hr} bpm` : ''
    } else {
      actual = lap ? paceToZone(lap.paceSecPerKm!, zones) : undefined
      realLabel = lap && t <= realTotal ? ` · lap ${lap.index}${lap.avgHr ? ` · ${Math.round(lap.avgHr)} bpm` : ''}` : ''
    }
    return {
      key: String(n),
      label: `${clock(t)} · ${planLabel}${realLabel}`,
      axisLabel: n === 0 ? '0' : mark,
      values: { zone: s.zone, actual },
    }
  })
  const withActual = real.length > 0 || !!speeds
  // Précision vs le plan (0–100), étape par étape : zone médiane courue au cœur de chaque étape (15 % retirés à chaque
  // bout, la courbe lissée y fait la transition), comparée à la zone visée. Une répétition plus rapide que prévu ou une
  // récup plus lente (marche, arrêt) ne coûtent rien ; crédit dégressif au-delà, zéro à 1 zone hors cible.
  // Le décalage global entre la sortie et le plan (échauffement plus long…) est recalé jusqu'à ±90 s ; pondéré par la durée.
  const actualAt = (t: number) => (t < 0 || t > realTotal ? undefined : data[Math.min(samples, Math.round((t / total) * samples))].values.actual)
  const stepScore = (st: (typeof steps)[number], from: number, offset: number) => {
    const core = st.seconds * 0.15
    const vals: number[] = []
    for (let t = from + core; t <= from + st.seconds - core; t += Math.max(1, total / samples)) {
      const v = actualAt(t + offset)
      if (v !== undefined) vals.push(v)
    }
    if (!vals.length) return 0
    const med = vals.sort((x, y) => x - y)[Math.floor(vals.length / 2)]
    const hard = st.kind === 'work' && st.zone >= 3
    const miss = hard ? Math.max(0, st.zone - 0.5 - med, med - (st.zone + 1.5)) : Math.max(0, med - (st.zone + 0.5))
    return Math.max(0, 1 - miss)
  }
  // Les répétitions comptent double : c'est le cœur de la séance.
  const weight = (st: (typeof steps)[number]) => st.seconds * (st.kind === 'work' && st.zone >= 3 ? 2 : 1)
  const totalWeight = steps.reduce((a, st) => a + weight(st), 0)
  const scoreWith = (offset: number) => {
    let from = 0
    let got = 0
    for (const st of steps) {
      got += stepScore(st, from, offset) * weight(st)
      from += st.seconds
    }
    return got / totalWeight
  }
  let best = 0
  if (withActual) for (let off = -90; off <= 90; off += 5) best = Math.max(best, scoreWith(off))
  const accuracy = withActual ? Math.round(best * 100) : null
  const onTarget = accuracy !== null && accuracy >= 80
  const series = withActual ? [...SERIES, { key: 'actual', label: onTarget ? 'Actual · on target' : 'Actual · off target', area: false, color: onTarget ? ACTUAL_COLOR.good : ACTUAL_COLOR.off }] : SERIES
  return (
    <div className={className}>
      {accuracy !== null && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-sm">Accuracy vs plan</span>
          <span className="font-medium text-2xl tabular-nums tracking-tight" style={{ color: accuracy >= 80 ? ACTUAL_COLOR.good : accuracy >= 60 ? ACTUAL_COLOR.off : '#e5534b' }}>
            {accuracy}%
          </span>
        </div>
      )}
      <LineChart
        data={data}
        series={series}
        label={withActual ? 'Planned and actual intensity' : 'Session intensity profile'}
        height={withActual ? 200 : 180}
        max={withActual ? 6.5 : 6}
        legend={withActual}
        curve="linear"
        categoryLabel="Time"
        formatValue={(v, line) => {
          if (line.key === 'actual') {
            const p = zoneToPace(v, zones)
            return p ? `${formatPace(p, units)} ${paceUnit(units)}` : `Z${v}`
          }
          return `Z${v} ${ZONE_NAMES[v] ?? ''}`
        }}
        formatTick={(v) => (v > 0 && v <= 6 && Number.isInteger(v) ? `Z${v}` : '')}
      />
    </div>
  )
}
