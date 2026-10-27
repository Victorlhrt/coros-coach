import { SlotText } from '@/components/arc/slot-text/slot-text'
import { ChevronLeft, Repeat as RepeatIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ActivityLinkCard } from '@/components/ActivityLinkCard'
import { EmptyState } from '@/components/EmptyState'
import { FeedbackCard } from '@/components/FeedbackCard'
import { SyncBadge } from '@/components/SyncBadge'
import { TypeBadge } from '@/components/TypeBadge'
import { WorkoutChart } from '@/components/WorkoutChart'
import { Card } from '@/components/ui/card'
import { Panel, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button as LinkButton } from '@/components/shadcn/button'
import { INTENSITY } from '@/platform/runner/coach-data'
import { formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { sessionTotals } from '@/lib/coach/metrics'
import type { Step, Zone } from '@/lib/coach/schema'
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
        <EmptyState icon={RepeatIcon} title="Séance introuvable">Elle a peut-être été retirée du plan.</EmptyState>
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
            aria-label="Retour"
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
          <Link to={ROUTES.plan}>Voir la semaine</Link>
        </LinkButton>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Structure" subtitle={session.blocks.length ? `${steps} étape${steps > 1 ? 's' : ''} · ${formatDuration(seconds)}${meters > 0 ? ` · ${formatDistance(meters, units)}` : ''}` : 'Renforcement'} />
          <div className="grid grid-cols-2 divide-x border-t sm:grid-cols-4 sm:divide-y-0">
            <Kpi label="Durée" value={formatDuration(seconds)} />
            <Kpi label="Distance estimée" value={meters > 0 ? formatDistance(meters, units) : '—'} />
            <Kpi label={`Allure moyenne ${paceUnit(units)}`} value={pace > 0 ? formatPace(pace, units) : '—'} />
            <Kpi label="Intensité" value={['', 'Facile', 'Modérée', 'Dure'][INTENSITY[session.type]]} />
          </div>
          {session.blocks.length > 0 && (
            <PanelSection divided>
              <WorkoutChart blocks={session.blocks} zones={zones} className="h-20" />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {[1, 2, 3, 4, 5, 6].map((z) => (
                  <span key={z} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: zoneColor(z) }} />Z{z} {ZONE_NAMES[z]}
                  </span>
                ))}
              </div>
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
                      {b.repeats} × la série
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

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Montre" subtitle={status === 'app-only' ? 'Le renforcement se suit depuis l’app.' : 'Envoi de la séance sur ta montre COROS'} actions={<SyncBadge status={status} />} />
          </Panel>
          {session.type !== 'strength' && <ActivityLinkCard session={session} />}
          {(session.date <= today() || links[session.id]?.labelId) && <FeedbackCard sessionId={session.id} />}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
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
        ? `≈ ${formatPace(zone.paceFast, units)}–${formatPace(zone.paceSlow, units)} ${paceUnit(units)} · FC Z${step.zone}`
        : `FC Z${step.zone}`
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
