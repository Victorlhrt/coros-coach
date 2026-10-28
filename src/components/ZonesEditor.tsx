import { useState } from 'react'
import { formatPace, parseClock } from '@/lib/coach/format'
import { zoneColor } from '@/lib/coach/ui'
import { ZONE_NAMES, zonesFromThreshold } from '@/lib/coach/zones'
import { usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'
import { Button } from './ui/button'
import { Input } from './ui/input'

/** Zones d'allure éditables (mm:ss par km). Recalculables depuis l'allure seuil. */
export function ZonesEditor() {
  const { zones, setZones, retuneZones, profile } = usePlan()
  const [threshold, setThreshold] = useState(profile?.thresholdPace ? formatPace(profile.thresholdPace) : formatPace(zones[3].paceSlow / 1.06))

  const edit = (zone: number, field: 'paceFast' | 'paceSlow', text: string) => {
    const value = parseClock(text)
    if (value === null || value < 120 || value > 1500) return
    setZones(zones.map((z) => (z.zone === zone ? { ...z, [field]: value } : z)))
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input aria-label="Threshold pace" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        <Button
          variant="secondary"
          className="shrink-0"
          onClick={() => {
            const t = parseClock(threshold)
            if (!t) return
            const n = retuneZones(zonesFromThreshold(t)).length
            if (n) toast.success(`${n} upcoming session${n > 1 ? 's' : ''} adjusted to the new zones`)
          }}
        >
          Recalculate
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Threshold pace (min/km) used to derive the zones.</p>
      <div className="mt-4 space-y-2">
        {zones.map((z) => (
          <div key={`${z.zone}-${z.paceFast}-${z.paceSlow}`} className="flex items-center gap-2">
            <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: zoneColor(z.zone) }} />
            <span className="w-24 text-sm font-medium">
              Z{z.zone} {ZONE_NAMES[z.zone] ?? z.name}
            </span>
            <Input className="h-10 text-center tabular-nums" defaultValue={formatPace(z.paceFast)} onBlur={(e) => edit(z.zone, 'paceFast', e.target.value)} />
            <span className="text-muted-foreground">–</span>
            <Input className="h-10 text-center tabular-nums" defaultValue={formatPace(z.paceSlow)} onBlur={(e) => edit(z.zone, 'paceSlow', e.target.value)} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        On the watch, endurance blocks are driven by the HR zones COROS calculates; quality blocks by pace.
      </p>
    </div>
  )
}
