import { Link2, Link2Off } from 'lucide-react'
import { diffDays, formatDay } from '@/lib/coach/dates'
import { formatClock, formatDistance, formatDuration, formatPace, paceUnit } from '@/lib/coach/format'
import { linkedActivity } from '@/lib/coach/links'
import type { Session } from '@/lib/coach/schema'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useLaps } from '@/lib/coros/laps'
import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { Card, CardTitle } from './ui/card'
import { Skeleton } from './ui/skeleton'

/** Activité COROS liée à la séance (auto ou choisie), avec ses splits. */
export function ActivityLinkCard({ session }: { session: Session }) {
  const { links, setLinks } = usePlan()
  const units = useSettings((s) => s.units)
  const { data, isLoading } = useActivities()
  const activities = data?.activities ?? []
  const activity = linkedActivity(session, links, activities)
  const link = links[session.id]
  const laps = useLaps(activity?.labelId, activity?.sportType, activity?.meters)

  // Toutes les activités chargées (6 semaines), les plus proches de la date prévue d'abord : une séance faite en avance ou en retard reste liable.
  const candidates = [...activities].sort((a, b) => Math.abs(diffDays(session.date, a.date)) - Math.abs(diffDays(session.date, b.date)))

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {activity ? <Link2 className="size-5 text-session-easy" /> : <Link2Off className="size-5 text-muted-foreground" />}
          Completed activity
        </CardTitle>
        {link?.auto && activity && <span className="text-xs text-muted-foreground">linked automatically</span>}
      </div>

      {isLoading && <Skeleton className="mt-3 h-16" />}

      {activity && (
        <>
          <p className="mt-2 text-sm text-muted-foreground capitalize">
            {activity.name} · {formatDay(activity.date, { weekday: 'long', day: 'numeric' })}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric label="Distance" value={activity.meters ? formatDistance(activity.meters, units, 2) : '—'} />
            <Metric label="Duration" value={activity.seconds ? formatDuration(activity.seconds) : '—'} />
            <Metric label={`Pace ${paceUnit(units)}`} value={activity.paceSecPerKm ? formatPace(activity.paceSecPerKm, units) : '—'} />
          </div>

          <p className="mt-4 text-sm font-medium">Splits</p>
          {laps.isLoading && <Skeleton className="mt-2 h-24" />}
          {laps.error && <p className="mt-1 text-sm text-destructive">{laps.error.message}</p>}
          {laps.data && laps.data.laps.length > 0 && (
            <table className="mt-2 w-full text-sm tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-medium">#</th>
                  <th className="text-right font-medium">Dist.</th>
                  <th className="text-right font-medium">Time</th>
                  <th className="text-right font-medium">Pace</th>
                  <th className="text-right font-medium">HR</th>
                </tr>
              </thead>
              <tbody>
                {laps.data.laps.map((l) => (
                  <tr key={l.index} className="border-t border-border">
                    <td className="py-1.5">{l.index}</td>
                    <td className="text-right">{l.meters ? formatDistance(l.meters, units, 2) : '—'}</td>
                    <td className="text-right">{l.seconds ? formatClock(l.seconds) : '—'}</td>
                    <td className="text-right font-medium">{l.paceSecPerKm ? formatPace(l.paceSecPerKm, units) : '—'}</td>
                    <td className="text-right">{l.avgHr ? Math.round(l.avgHr) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {laps.data && laps.data.laps.length === 0 && (
            <details className="mt-1 text-xs text-muted-foreground">
              <summary>Unrecognised splits format — see the raw response</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(laps.data.raw, null, 2).slice(0, 3000)}</pre>
            </details>
          )}
        </>
      )}

      {!activity && !isLoading && <p className="mt-2 text-sm text-muted-foreground">No COROS activity linked to this session.</p>}

      {candidates.length > 0 && (
        <label className="mt-4 block text-sm text-muted-foreground">
          {activity ? 'Change activity' : 'Link an activity'}
          <select
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground"
            value={activity?.labelId ?? ''}
            onChange={(e) => {
              const picked = activities.find((a) => a.labelId === e.target.value)
              // L'activité choisie quitte la séance à laquelle elle avait été liée automatiquement.
              const released = Object.fromEntries(
                Object.entries(links)
                  .filter(([id, l]) => id !== session.id && l.auto && picked && l.labelId === picked.labelId)
                  .map(([id, l]) => [id, { ...l, labelId: null, auto: false }]),
              )
              setLinks({ ...released, [session.id]: { labelId: picked?.labelId ?? null, sportType: picked?.sportType ?? 100, auto: false } })
            }}
          >
            <option value="">None</option>
            {candidates.map((a) => (
              <option key={a.labelId} value={a.labelId}>
                {formatDay(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {a.name} · {a.meters ? formatDistance(a.meters, units) : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
    </div>
  )
}
