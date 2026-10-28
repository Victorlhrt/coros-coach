import { LineChart } from '@/components/arc/line-chart/line-chart'
import type { CourseProfile } from '@/lib/coach/gpx'
import { formatNumber } from '@/lib/coach/format'

const SERIES = [{ key: 'ele', label: 'Altitude', area: true }]

/** Profil altimétrique (Arc LineChart) : glisser le doigt donne l'altitude au km. */
export function ElevationChart({ course, className }: { course: CourseProfile; className?: string }) {
  // ~120 points suffisent à l'écran et gardent le survol fluide.
  const step = Math.max(1, Math.ceil(course.profile.length / 120))
  const points = course.profile.filter((_, i) => i % step === 0 || i === course.profile.length - 1)
  const tick = course.distanceKm > 30 ? 10 : 5
  // Graduation sur le premier point qui dépasse chaque multiple de 5 (ou 10) km.
  let next = tick
  const data = points.map(([km, ele], i) => {
    const mark = km >= next ? `${next} km` : undefined
    while (km >= next) next += tick
    return { key: String(i), label: `km ${formatNumber(Math.round(km * 10) / 10)}`, axisLabel: mark, values: { ele: Math.round(ele) } }
  })
  return (
    <LineChart
      className={className}
      data={data}
      series={SERIES}
      label={`Profile: ${course.gain} m elevation gain`}
      unit="m"
      height={120}
      legend={false}
      categoryLabel="Distance"
      emptyLabel="Profile unavailable"
      formatValue={(v) => `${formatNumber(v)} m`}
      formatTick={formatNumber}
    />
  )
}
