import { Mountain, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { analyzeGpx } from '@/lib/coach/gpx'
import { TERRAINS, type Goal, type Terrain } from '@/lib/coach/schema'
import { ElevationChart } from './ElevationChart'
import { Button } from './ui/button'
import { Card, CardDescription, CardTitle } from './ui/card'
import { Chip } from './ui/chip'
import { Input } from './ui/input'

/** Profil de la course : GPX analysé dans le navigateur, ou terrain et D+ saisis à la main. */
export function CourseCard({ goal, update }: { goal: Goal; update: (patch: Partial<Goal>) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const course = goal.course

  async function onFile(file: File) {
    setError(null)
    try {
      const c = analyzeGpx(await file.text())
      update({ course: c, courseKm: c.distanceKm, elevationGain: c.gain, terrain: goal.terrain === 'road' && c.gain / c.distanceKm > 20 ? 'trail' : goal.terrain })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Mountain className="size-6 text-accent" />
        <div className="flex-1">
          <CardTitle>Profil de la course</CardTitle>
          <CardDescription>Importe le GPX pour adapter la préparation au parcours.</CardDescription>
        </div>
      </div>

      {course ? (
        <div className="mt-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{course.name}</p>
            <button aria-label="Retirer le GPX" className="text-muted-foreground" onClick={() => update({ course: null })}>
              <X className="size-5" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Stat label="Distance" value={`${course.distanceKm} km`} />
            <Stat label="D+" value={`${course.gain} m`} />
            <Stat label="D-" value={`${course.loss} m`} />
          </div>
          <ElevationChart course={course} className="mt-3" />
          {course.segments.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {course.segments
                .filter((s) => s.elevation >= 60)
                .slice(0, 8)
                .map((s, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className={s.kind === 'climb' ? 'text-accent' : 'text-session-long'}>
                      {s.kind === 'climb' ? '↗ Montée' : '↘ Descente'} km {s.startKm}–{s.endKm}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.elevation} m · {Math.abs(s.grade)} %
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm text-muted-foreground">
            Dénivelé + (m)
            <Input className="mt-1" inputMode="numeric" value={goal.elevationGain ?? ''} onChange={(e) => update({ elevationGain: Number(e.target.value) || null })} />
          </label>
          {goal.distance === 'trail' && (
            <label className="text-sm text-muted-foreground">
              Distance (km)
              <Input className="mt-1" inputMode="decimal" value={goal.courseKm ?? ''} onChange={(e) => update({ courseKm: Number(e.target.value.replace(',', '.')) || null })} />
            </label>
          )}
        </div>
      )}

      <p className="mt-4 mb-2 text-sm font-medium text-muted-foreground">Terrain</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TERRAINS) as Terrain[]).map((t) => (
          <Chip key={t} active={goal.terrain === t} onClick={() => update({ terrain: t })}>
            {TERRAINS[t]}
          </Chip>
        ))}
      </div>

      <Button variant="secondary" className="mt-4 w-full" onClick={() => fileInput.current?.click()}>
        <Upload className="size-4" /> {course ? 'Remplacer le GPX' : 'Importer un GPX'}
      </Button>
      {/* Pas de filtre accept : iOS grise souvent les .gpx sinon. */}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  )
}
