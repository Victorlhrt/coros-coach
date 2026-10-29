import { SlotText } from '@/components/arc/slot-text/slot-text'
import { ChevronLeft, Repeat as RepeatIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ActivityLinkCard } from '@/components/ActivityLinkCard'
import { EmptyState } from '@/components/EmptyState'
import { FeedbackCard } from '@/components/FeedbackCard'
import { SyncBadge } from '@/components/SyncBadge'
import { TypeBadge } from '@/components/TypeBadge'
import { SessionProfileChart } from '@/components/SessionProfileChart'
import { Card } from '@/components/ui/card'
import { Panel, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button as LinkButton } from '@/components/shadcn/button'
import { INTENSITY } from '@/platform/runner/coach-data'
import { formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { flatten, sessionTotals } from '@/lib/coach/metrics'
import type { Block, Session, Step, Zone } from '@/lib/coach/schema'
import { linkedActivity } from '@/lib/coach/links'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useLaps } from '@/lib/coros/laps'
import { STEP_LABEL, zoneColor } from '@/lib/coach/ui'
import { ZONE_NAMES } from '@/lib/coach/zones'
import { syncStatus } from '@/lib/coros/sync'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { ROUTES } from '@/lib/coach/routes'

export function SessionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { plan, zones, coros, links } = usePlan()
  const units = useSettings((s) => s.units)
  const session = allSessions(plan).find((s) => s.id === id)
  const location = useLocation()

  useEffect(() => {
    if (location.hash === '#ressenti') document.getElementById('ressenti')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash])

  if (!plan || !session) {
    return (
      <Card className="mt-6">
        <EmptyState icon={RepeatIcon} title="Session not found">It may have been removed from the plan.</EmptyState>
      </Card>
    )
  }

  const { seconds, meters } = sessionTotals(session, zones)
  const status = syncStatus(plan, coros.synced, session)

  const pace = meters > 0 ? seconds / (meters / 1000) : 0
  const steps = session.blocks.reduce((n, b) => n + (b.kind === 'repeat' ? b.steps.length * b.repeats : 1), 0)

  return (
    <div className="flex w-full flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="flex min-w-0 items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground capitalize">
              {formatDay(session.date)} <TypeBadge type={session.type} />
            </p>
            <h1 className="mt-1 font-heading text-2xl leading-tight font-medium tracking-tight">{session.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{session.description}</p>
          </div>
        </div>
        <LinkButton asChild variant="outline" size="sm">
          <Link to={ROUTES.plan}>View week</Link>
        </LinkButton>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Structure" subtitle={session.blocks.length ? `${steps} step${steps > 1 ? 's' : ''} · ${formatDuration(seconds)}${meters > 0 ? ` · ${formatDistance(meters, units)}` : ''}` : 'Strength'} />
          <div className="no-scrollbar flex snap-x snap-mandatory divide-x overflow-x-auto border-t sm:grid sm:grid-cols-4">
            <Kpi label="Duration" value={formatDuration(seconds)} />
            <Kpi label="Estimated distance" value={meters > 0 ? formatDistance(meters, units) : '—'} />
            <Kpi label={`Average pace ${paceUnit(units)}`} value={pace > 0 ? formatPace(pace, units) : '—'} />
            <Kpi label="Intensity" value={['', 'Easy', 'Moderate', 'Hard'][INTENSITY[session.type]]} />
          </div>
          {session.blocks.length > 0 && (
            <PanelSection divided>
              <SessionProfile session={session} zones={zones} units={units} />
            </PanelSection>
          )}
          {session.blocks.length > 0 && (
            <ul className="divide-y border-t">
              {session.blocks.map((b, i) =>
                b.kind === 'repeat' ? (
                  <li key={i} className="px-6 py-4">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="flex size-6 items-center justify-center rounded-full border">
                        <RepeatIcon className="size-3" />
                      </span>
                      {b.repeats} × the set
                    </p>
                    <ul className="mt-3 ml-3 space-y-3 border-l pl-5">
                      {b.steps.map((s, j) => (
                        <StepRow key={j} step={s} zones={zones} units={units} />
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={i} className="px-6 py-4">
                    <StepRow step={b} zones={zones} units={units} />
                  </li>
                ),
              )}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-4 xl:[&>*:last-child]:flex-1">
          <Panel>
            <PanelHeader title="Watch" actions={<SyncBadge status={status} />} />
          </Panel>
          {session.blocks.length > 0 && <ZoneSplit blocks={session.blocks} zones={zones} />}
          {session.type !== 'strength' && <ActivityLinkCard session={session} />}
        </div>
      </div>
      {(session.date <= today() || links[session.id]?.labelId) && <FeedbackCard sessionId={session.id} />}
    </div>
  )
}

/** Profil prévu, avec la courbe réelle (tours de l'activité COROS liée) par-dessus une fois la séance faite. */
function SessionProfile({ session, zones, units }: { session: Session; zones: Zone[]; units: Units }) {
  const links = usePlan((s) => s.links)
  const { data } = useActivities()
  const activity = linkedActivity(session, links, data?.activities ?? [])
  const laps = useLaps(activity?.labelId, activity?.sportType, activity?.meters)
  return (
    <>
      <SessionProfileChart blocks={session.blocks} zones={zones} units={units} laps={laps.data?.laps} />
      {activity && laps.data && !laps.data.laps.some((l) => l.paceSecPerKm) && (
        <p className="mt-2 text-muted-foreground text-xs">No splits from COROS for this run, so only the planned profile is shown.</p>
      )}
    </>
  )
}

/** Temps passé dans chaque zone, en barres aux couleurs des zones. */
function ZoneSplit({ blocks, zones }: { blocks: Block[]; zones: Zone[] }) {
  const steps = flatten(blocks, zones)
  const total = steps.reduce((a, s) => a + s.seconds, 0) || 1
  const byZone = [1, 2, 3, 4, 5, 6].map((z) => ({ z, seconds: steps.filter((s) => s.zone === z).reduce((a, s) => a + s.seconds, 0) })).filter((r) => r.seconds > 0)
  return (
    <Panel>
      <PanelHeader title="Time in zone" subtitle={`${byZone.length} zone${byZone.length > 1 ? 's' : ''} worked`} />
      <ul className="space-y-3 border-t px-6 py-5">
        {byZone.map(({ z, seconds }) => (
          <li key={z}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                Z{z} <span className="text-muted-foreground">{ZONE_NAMES[z]}</span>
              </span>
              <span className="tabular-nums">
                {formatDuration(seconds)} <span className="text-muted-foreground text-xs">· {Math.round((seconds / total) * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${(seconds / total) * 100}%`, backgroundColor: zoneColor(z) }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-[44%] shrink-0 snap-start px-6 py-4 sm:w-auto">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <SlotText value={value} className="mt-1 text-2xl font-medium tracking-tight tabular-nums" />
    </div>
  )
}

function StepRow({ step, zones, units }: { step: Step; zones: Zone[]; units: Units }) {
  const zone = zones.find((z) => z.zone === step.zone)
  const target = step.target === 'distance' ? formatDistance(step.value, units, step.value % 1000 === 0 ? 0 : 2) : formatDuration(step.value)
  const pace =
    step.paceFast && step.paceSlow
      ? `${formatPace(step.paceFast, units)}–${formatPace(step.paceSlow, units)} ${paceUnit(units)}`
      : zone
        ? `≈ ${formatPace(zone.paceFast, units)}–${formatPace(zone.paceSlow, units)} ${paceUnit(units)} · HR Z${step.zone}`
        : `HR Z${step.zone}`
  return (
    <div className="flex items-center gap-4">
      <span className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: zoneColor(step.zone) }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {STEP_LABEL[step.kind]} · Z{step.zone} {ZONE_NAMES[step.zone]}
        </p>
        <p className="font-medium tabular-nums">{target}</p>
      </div>
      <p className="shrink-0 rounded-full border px-3 py-1 text-right text-xs tabular-nums">{pace}</p>
    </div>
  )
}
