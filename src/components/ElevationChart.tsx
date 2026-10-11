import type { CourseProfile } from '@/lib/coach/gpx'
import { cn } from '@/lib/utils'

/** Profil altimétrique (aire) avec les montées marquées surlignées. */
export function ElevationChart({ course, className }: { course: CourseProfile; className?: string }) {
  const W = 340
  const H = 110
  const pad = 4
  const max = course.distanceKm || 1
  const lo = course.minEle - 10
  const hi = Math.max(course.maxEle + 10, lo + 50)
  const x = (km: number) => pad + (km / max) * (W - 2 * pad)
  const y = (e: number) => H - pad - ((e - lo) / (hi - lo)) * (H - 2 * pad - 14)
  const line = course.profile.map(([k, e], i) => `${i ? 'L' : 'M'}${x(k).toFixed(1)},${y(e).toFixed(1)}`).join(' ')
  const area = `${line} L${x(max)},${H - pad} L${x(0)},${H - pad} Z`
  const ticks = Array.from({ length: Math.floor(max / (max > 30 ? 10 : 5)) }, (_, i) => (i + 1) * (max > 30 ? 10 : 5))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full', className)} role="img" aria-label={`Profil : ${course.gain} m de dénivelé positif`}>
      <path d={area} fill="color-mix(in oklch, var(--accent) 22%, transparent)" />
      {course.segments
        .filter((s) => s.kind === 'climb')
        .map((s, i) => (
          <rect key={i} x={x(s.startKm)} y={pad} width={Math.max(1, x(s.endKm) - x(s.startKm))} height={H - 2 * pad} fill="var(--accent)" opacity={0.08} />
        ))}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 1} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">
          {t}
        </text>
      ))}
      <text x={pad} y={10} fontSize={9} fill="var(--muted-foreground)">
        {course.maxEle} m
      </text>
    </svg>
  )
}
