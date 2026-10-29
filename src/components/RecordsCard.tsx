import { useMutation } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { formatClock, formatPace, parseClock } from '@/lib/coach/format'
import { mergeRecords } from '@/lib/coach/records'
import { RECORD_DISTANCES, bestVdot, predictTime, thresholdPace, type RecordKey } from '@/lib/coach/vdot'
import { zonesFromThreshold } from '@/lib/coach/zones'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { fetchRecords } from '@/lib/coros/data'
import { usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'
import { Button } from './ui/button'
import { Card, CardTitle } from './ui/card'
import { Input } from './ui/input'

/** Records des 12 derniers mois (COROS ou saisis) → VDOT, allure seuil et prédictions. */
export function RecordsCard() {
  const { records, setRecords, retuneZones, profile, setProfile } = usePlan()
  const connected = useCorosAuth((s) => s.connected)
  const vdot = bestVdot(records)

  const load = useMutation({
    mutationFn: fetchRecords,
    onSuccess: (fresh) => {
      setRecords(mergeRecords(usePlan.getState().records, fresh))
      toast.success(fresh.length ? `${fresh.length} record${fresh.length > 1 ? 's' : ''} found` : 'No races at these distances in the last 12 months')
    },
    onError: toast.error,
  })

  function edit(key: RecordKey, text: string) {
    const others = records.filter((r) => r.key !== key)
    if (!text.trim()) return setRecords(others)
    const seconds = parseClock(text)
    if (seconds && seconds > 600) setRecords([...others, { key, seconds, date: null, source: 'manual' }])
  }

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <Trophy className="size-5 text-accent" /> Runner profile
      </CardTitle>

      <div className="mt-4 space-y-2">
        {RECORD_DISTANCES.map((d) => {
          const r = records.find((x) => x.key === d.key)
          return (
            <div key={`${d.key}-${r?.seconds ?? ''}`} className="flex items-center gap-3">
              <span className="w-20 text-sm font-medium">{d.label}</span>
              <Input
                className="h-10 flex-1 tabular-nums"
                inputMode="numeric"
                placeholder={vdot ? `≈ ${formatClock(predictTime(vdot, d.meters))}` : '—'}
                defaultValue={r ? formatClock(r.seconds) : ''}
                onBlur={(e) => edit(d.key, e.target.value)}
              />
              <span className="w-20 text-right text-xs text-muted-foreground">
                {r ? (r.source === 'manual' ? 'manual' : r.date) : vdot ? 'predicted' : ''}
              </span>
            </div>
          )
        })}
      </div>

      {vdot && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">VDOT</p>
            <p className="text-2xl font-medium tabular-nums">{vdot}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">Estimated threshold pace</p>
            <p className="text-2xl font-medium tabular-nums">{formatPace(thresholdPace(vdot))}</p>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" disabled={!connected || load.isPending} onClick={() => load.mutate()}>
          {load.isPending ? 'Searching…' : 'Fetch (COROS)'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!vdot}
          onClick={() => {
            const pace = thresholdPace(vdot!)
            const n = retuneZones(zonesFromThreshold(pace)).length
            if (profile) setProfile({ ...profile, thresholdPace: pace })
            toast.success(`Zones recalculated (threshold ${formatPace(pace)}/km)${n ? ` · ${n} upcoming session${n > 1 ? 's' : ''} adjusted` : ''}`)
          }}
        >
          Apply to zones
        </Button>
      </div>
    </Card>
  )
}
