import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Footprints, Gauge, HeartPulse, Link2, Link2Off, Route, Timer, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/arc/badge/badge'
import { Select } from '@/components/arc/select/select'
import { Panel, PanelHeader, PanelSection } from '@/components/raice/panel'
import { diffDays, formatDay } from '@/lib/coach/dates'
import { formatClock, formatDistance, formatDuration, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { linkedActivity } from '@/lib/coach/links'
import type { Session } from '@/lib/coach/schema'
import type { Activity } from '@/lib/coros/activities'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useLaps, type Lap } from '@/lib/coros/laps'
import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { cn } from '@/lib/utils'
import { api } from '@/platform/api'
import { Skeleton } from './ui/skeleton'

const NONE = '__none'

/** Activité COROS liée à la séance (auto ou choisie) : chiffres clés, tours en barres, splits et chaussure portée. */
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

  const pick = (labelId: string) => {
    const picked = activities.find((a) => a.labelId === labelId)
    // L'activité choisie quitte la séance à laquelle elle avait été liée automatiquement.
    const released = Object.fromEntries(
      Object.entries(links)
        .filter(([id, l]) => id !== session.id && l.auto && picked && l.labelId === picked.labelId)
        .map(([id, l]) => [id, { ...l, labelId: null, auto: false }]),
    )
    setLinks({ ...released, [session.id]: { labelId: picked?.labelId ?? null, sportType: picked?.sportType ?? 100, auto: false } })
  }

  return (
    <Panel className="@container">
      <PanelHeader
        title="Completed activity"
        subtitle={activity ? <span className="capitalize">{activity.name} · {formatDay(activity.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span> : undefined}
        actions={
          activity ? (
            <Badge size="sm" tone="success" icon={<Link2 className="size-3" />}>
              {link?.auto ? 'Auto-linked' : 'Linked'}
            </Badge>
          ) : (
            !isLoading && (
              <Badge size="sm" icon={<Link2Off className="size-3" />}>
                Not linked
              </Badge>
            )
          )
        }
      />

      {isLoading && (
        <PanelSection divided>
          <Skeleton className="h-16" />
        </PanelSection>
      )}

      {activity && (
        <>
          <div className="grid grid-cols-2 gap-px border-t bg-border @lg:grid-cols-4">
            <Kpi icon={<Route />} label="Distance" value={activity.meters ? formatDistance(activity.meters, units, 2) : '—'} />
            <Kpi icon={<Timer />} label="Time" value={activity.seconds ? formatDuration(activity.seconds) : '—'} />
            <Kpi icon={<Gauge />} label={`Pace ${paceUnit(units)}`} value={activity.paceSecPerKm ? formatPace(activity.paceSecPerKm, units) : '—'} />
            <Kpi icon={<HeartPulse />} label="Avg HR" value={activity.avgHr ? `${Math.round(activity.avgHr)}` : '—'} unit={activity.avgHr ? 'bpm' : undefined} />
          </div>

          {laps.isLoading && (
            <PanelSection divided>
              <Skeleton className="h-28" />
            </PanelSection>
          )}
          {laps.error && (
            <PanelSection divided>
              <p className="text-destructive text-sm">{laps.error.message}</p>
            </PanelSection>
          )}
          {laps.data && laps.data.laps.length > 0 && <Splits laps={laps.data.laps} units={units} />}
          {laps.data && laps.data.laps.length === 0 && (
            <PanelSection divided>
              <details className="text-muted-foreground text-xs">
                <summary>Unrecognised splits format — see the raw response</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(laps.data.raw, null, 2).slice(0, 3000)}</pre>
              </details>
            </PanelSection>
          )}
        </>
      )}

      {(activity || candidates.length > 0) && (
        <PanelSection divided className="grid gap-4 @lg:grid-cols-2">
          {activity && <ShoePicker activity={activity} />}
          {candidates.length > 0 && (
            <Select
              label={activity ? 'Activity' : 'Link an activity'}
              value={activity?.labelId ?? NONE}
              onValueChange={(v) => pick(v === NONE ? '' : v)}
              options={[
                { value: NONE, label: 'None' },
                ...candidates.map((a) => ({
                  value: a.labelId,
                  label: `${formatDay(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${a.name}${a.meters ? ` · ${formatDistance(a.meters, units)}` : ''}`,
                })),
              ]}
            />
          )}
        </PanelSection>
      )}
    </Panel>
  )
}

function Kpi({ icon, label, value, unit }: { icon: ReactNode; label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 bg-card px-5 py-4">
      <p className="flex items-center gap-1.5 truncate text-muted-foreground text-xs [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate font-medium text-xl tabular-nums tracking-tight">
        {value}
        {unit && <span className="ml-1 font-normal text-muted-foreground text-xs">{unit}</span>}
      </p>
    </div>
  )
}

/** Tour exploitable pour le classement : allure connue et au moins 100 m (un bout de tour final ne compte pas). */
const ranked = (l: Lap) => !!l.paceSecPerKm && (l.meters ?? 0) >= 100

/** Tours en barres (hauteur = vitesse, le plus rapide en clair) puis liste des splits, survol partagé. */
function Splits({ laps, units }: { laps: Lap[]; units: Units }) {
  const [active, setActive] = useState<number | null>(null)
  const paces = laps.filter(ranked).map((l) => l.paceSecPerKm!)
  const fastest = paces.length > 1 ? laps.find((l) => ranked(l) && l.paceSecPerKm === Math.min(...paces))?.index : undefined
  const slowest = paces.length > 2 ? laps.find((l) => ranked(l) && l.paceSecPerKm === Math.max(...paces))?.index : undefined
  // Vitesse (inverse de l'allure) : une barre haute = un tour rapide.
  const speeds = laps.map((l) => (l.paceSecPerKm ? 1000 / l.paceSecPerKm : 0))
  const known = speeds.filter((s) => s > 0)
  const min = Math.min(...known)
  const max = Math.max(...known)
  const height = (s: number) => (s <= 0 ? 4 : max - min < 1e-6 ? 70 : 22 + (78 * (s - min)) / (max - min))
  const totalM = laps.reduce((a, l) => a + (l.meters ?? 0), 0)
  const totalS = laps.reduce((a, l) => a + (l.seconds ?? 0), 0)
  const avgSpeed = totalM && totalS ? totalM / totalS : 0
  const shown = laps.find((l) => l.index === (active ?? fastest))
  const hrs = laps.map((l) => l.avgHr ?? 0)
  const maxHr = Math.max(...hrs)

  return (
    <>
      <PanelSection divided className="pb-4">
        <div className="flex h-5 items-center justify-between gap-3 text-xs">
          <span className="font-medium">Laps</span>
          {shown && (
            <span className="flex min-w-0 items-center gap-2 truncate text-muted-foreground tabular-nums">
              <span className="text-foreground">Lap {shown.index}</span>
              {shown.meters ? <span>{formatDistance(shown.meters, units, 2)}</span> : null}
              {shown.paceSecPerKm ? (
                <span className="text-foreground">
                  {formatPace(shown.paceSecPerKm, units)}
                  {paceUnit(units)}
                </span>
              ) : null}
              {shown.avgHr ? <span>{Math.round(shown.avgHr)} bpm</span> : null}
            </span>
          )}
        </div>
        <div className="relative mt-3 flex h-24 items-end gap-[3px]" onPointerLeave={() => setActive(null)}>
          {avgSpeed > 0 && known.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 border-foreground/25 border-t border-dashed" style={{ bottom: `${height(avgSpeed)}%` }} aria-hidden />
          )}
          {laps.map((l, i) => (
            <button
              key={l.index}
              type="button"
              aria-label={`Lap ${l.index}${l.paceSecPerKm ? `, ${formatPace(l.paceSecPerKm, units)} ${paceUnit(units)}` : ''}`}
              onPointerEnter={() => setActive(l.index)}
              onFocus={() => setActive(l.index)}
              onClick={() => setActive(l.index)}
              className="group flex h-full min-w-0 flex-1 items-end"
              // Largeur proportionnelle à la distance : un bout de tour final reste étroit.
              style={{ flexGrow: Math.max(0.35, (l.meters ?? 1000) / 1000) }}
            >
              <span
                className={cn(
                  'block w-full rounded-t-[4px] transition-colors',
                  l.index === fastest ? 'bg-foreground' : l.index === slowest ? 'bg-foreground/15' : 'bg-foreground/30',
                  active === l.index && l.index !== fastest && 'bg-foreground/60',
                )}
                style={{ height: `${height(speeds[i])}%` }}
              />
            </button>
          ))}
        </div>
      </PanelSection>

      <ul className="border-t pb-2 text-sm tabular-nums" onPointerLeave={() => setActive(null)}>
        <li className="flex items-center gap-3 px-6 pt-3 pb-1 text-muted-foreground text-xs">
          <span className="w-5 shrink-0">#</span>
          <span className="flex-1">Pace</span>
          <span className="w-14 shrink-0 text-right">Dist.</span>
          <span className="w-12 shrink-0 text-right">Time</span>
          <span className="w-10 shrink-0 text-right">HR</span>
        </li>
        {laps.map((l, i) => {
          const isFast = l.index === fastest
          const isSlow = l.index === slowest
          return (
            <li
              key={l.index}
              onPointerEnter={() => setActive(l.index)}
              className={cn('flex items-center gap-3 px-6 py-2 transition-colors', active === l.index && 'bg-foreground/[0.04]', isSlow && 'text-muted-foreground')}
            >
              <span className="w-5 shrink-0 text-muted-foreground">{l.index}</span>
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className={cn('w-10 shrink-0 font-medium', isFast && 'text-foreground')}>{l.paceSecPerKm ? formatPace(l.paceSecPerKm, units) : '—'}</span>
                <span className="h-1.5 min-w-4 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                  <span className={cn('block h-full rounded-full', isFast ? 'bg-foreground' : isSlow ? 'bg-foreground/20' : 'bg-foreground/40')} style={{ width: `${height(speeds[i])}%` }} />
                </span>
                {/* Panneau étroit (mobile) : l'éclair seul, le badge complet déborderait sur les colonnes. */}
                {isFast && (
                  <>
                    <span className="hidden shrink-0 @sm:inline-flex">
                      <Badge size="sm" tone="success" icon={<Zap className="size-3" />}>
                        Fastest
                      </Badge>
                    </span>
                    <Zap aria-label="Fastest" className="size-3.5 shrink-0 text-session-easy @sm:hidden" />
                  </>
                )}
              </span>
              <span className="w-14 shrink-0 text-right text-muted-foreground">{l.meters ? formatDistance(l.meters, units, 2) : '—'}</span>
              <span className="w-12 shrink-0 text-right">{l.seconds ? formatClock(l.seconds) : '—'}</span>
              <span className="flex w-10 shrink-0 items-center justify-end gap-1">
                {l.avgHr ? (
                  <>
                    <HeartPulse className={cn('size-3', maxHr > 0 && l.avgHr === maxHr ? 'text-destructive' : 'text-muted-foreground/60')} />
                    {Math.round(l.avgHr)}
                  </>
                ) : (
                  '—'
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

type ActivityShoe = { id: string; brand: string; model: string; km: number; credited: boolean }
type ActivityShoes = { shoes: ActivityShoe[]; assignments: Record<string, string> }

/** Chaussure portée pour l'activité : la paire par défaut tant qu'aucune autre n'est choisie. */
function ShoePicker({ activity }: { activity: Activity }) {
  const qc = useQueryClient()
  const key = ['account', 'activity-shoes', activity.labelId]
  const { data, isPending, isError } = useQuery({
    queryKey: key,
    queryFn: () => api<ActivityShoes>(`/account/activity-shoes?labels=${encodeURIComponent(activity.labelId)}`),
  })
  const save = useMutation({
    mutationFn: (shoeId: string) =>
      api<{ shoes: ActivityShoe[]; shoeId: string | null }>(`/account/activity-shoes/${encodeURIComponent(activity.labelId)}`, {
        method: 'PUT',
        body: { shoeId, date: activity.date, meters: activity.meters ?? 0 },
      }),
    onSuccess: (r) => {
      qc.setQueryData<ActivityShoes>(key, (prev) => ({ shoes: r.shoes, assignments: { ...prev?.assignments, ...(r.shoeId ? { [activity.labelId]: r.shoeId } : {}) } }))
      // Le kilométrage des paires (Equipment) vient de changer.
      void qc.invalidateQueries({ queryKey: ['account', 'overview'] })
    },
  })
  if (isPending) return <Skeleton className="h-[68px]" />
  if (isError || !data) return null
  if (!data.shoes.length)
    return (
      <p className="flex items-center gap-2 self-end text-muted-foreground text-sm">
        <Footprints className="size-4" />
        <Link to="/account/equipment" className="underline-offset-4 hover:text-foreground hover:underline">
          Add your shoes
        </Link>
      </p>
    )
  const current = data.assignments[activity.labelId] ?? data.shoes.find((s) => s.credited)?.id ?? data.shoes[0].id
  return (
    <Select
      label="Shoes"
      value={current}
      disabled={save.isPending}
      onValueChange={(v) => v !== current && save.mutate(v)}
      options={data.shoes.map((s) => ({ value: s.id, label: `${s.brand} ${s.model}`.trim() + ` · ${Math.round(s.km)} km` }))}
    />
  )
}
