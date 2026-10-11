import { useMutation } from '@tanstack/react-query'
import { SlotText } from '@/components/arc/slot-text/slot-text'
import { TextMorph } from '@/components/arc/text-morph/text-morph'
import { ChevronLeft, Repeat as RepeatIcon, Send } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ActivityLinkCard } from '@/components/ActivityLinkCard'
import { EmptyState } from '@/components/EmptyState'
import { FeedbackCard } from '@/components/FeedbackCard'
import { SyncBadge } from '@/components/SyncBadge'
import { TypeBadge } from '@/components/TypeBadge'
import { WorkoutChart } from '@/components/WorkoutChart'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration, formatPace, paceUnit, type Units } from '@/lib/coach/format'
import { sessionTotals } from '@/lib/coach/metrics'
import type { Step, Zone } from '@/lib/coach/schema'
import { STEP_LABEL, zoneColor } from '@/lib/coach/ui'
import { ZONE_NAMES } from '@/lib/coach/zones'
import { pushDays, syncStatus } from '@/lib/coros/sync'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'

export function SessionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { plan, zones, coros } = usePlan()
  const units = useSettings((s) => s.units)
  const session = allSessions(plan).find((s) => s.id === id)
  const location = useLocation()

  useEffect(() => {
    if (location.hash === '#ressenti') document.getElementById('ressenti')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash])

  const push = useMutation({
    mutationFn: () => pushDays(plan!, [session!.date], `la séance du ${formatDay(session!.date)}`),
    onSuccess: (ok) => ok && toast.success('Envoyé sur la montre ✓'),
    onError: toast.error,
  })

  if (!plan || !session) {
    return (
      <Card className="mt-6">
        <EmptyState icon={RepeatIcon} title="Séance introuvable" />
      </Card>
    )
  }

  const { seconds, meters } = sessionTotals(session, zones)
  const status = syncStatus(plan, coros.synced, session)

  return (
    <div className="space-y-4 pb-4">
      <header className="flex items-center gap-2 pt-4">
        <button onClick={() => navigate(-1)} aria-label="Retour" className="-ml-2 p-2">
          <ChevronLeft className="size-6" />
        </button>
        <p className="flex-1 text-sm font-medium text-muted-foreground capitalize">{formatDay(session.date)}</p>
      </header>

      <div className="px-1">
        <TypeBadge type={session.type} />
        <h1 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight">{session.title}</h1>
        <p className="mt-2 text-muted-foreground">{session.description}</p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Durée</p>
            <SlotText value={formatDuration(seconds)} className="text-4xl font-extrabold tracking-tight" />
          </div>
          {meters > 0 && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Distance est.</p>
              <SlotText value={formatDistance(meters, units)} className="text-4xl font-extrabold tracking-tight" />
            </div>
          )}
        </div>
        {session.blocks.length > 0 && <WorkoutChart blocks={session.blocks} zones={zones} className="mt-5" />}
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
          {[1, 2, 3, 4, 5, 6].map((z) => (
            <span key={z} className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: zoneColor(z) }} />Z{z}
            </span>
          ))}
        </div>
      </Card>

      {session.blocks.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {session.blocks.map((b, i) =>
              b.kind === 'repeat' ? (
                <li key={i} className="p-4">
                  <p className="flex items-center gap-2 font-bold">
                    <RepeatIcon className="size-4 text-accent" /> {b.repeats} ×
                  </p>
                  <ul className="mt-2 space-y-2 border-l-2 border-accent/40 pl-3">
                    {b.steps.map((s, j) => (
                      <StepRow key={j} step={s} zones={zones} units={units} />
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={i} className="p-4">
                  <StepRow step={b} zones={zones} units={units} />
                </li>
              ),
            )}
          </ul>
        </Card>
      )}

      {session.date <= today() && session.type !== 'strength' && <ActivityLinkCard session={session} />}
      {session.date <= today() && <FeedbackCard sessionId={session.id} />}

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Montre</p>
          <SyncBadge status={status} />
        </div>
        {status === 'app-only' ? (
          <p className="mt-2 text-sm text-muted-foreground">Le renforcement n’est pas pris en charge par COROS : suis-le depuis l’app.</p>
        ) : (
          session.date >= today() && (
            <Button className="mt-4 w-full" onClick={() => push.mutate()} disabled={push.isPending || status === 'synced'}>
              <Send className="size-5" />
              <TextMorph>{!coros.created ? 'Envoyer le plan sur la montre' : status === 'synced' ? 'À jour sur la montre' : 'Envoyer sur la montre'}</TextMorph>
            </Button>
          )
        )}
      </Card>

      <Link to="/plan" className="block text-center text-sm font-medium text-muted-foreground">
        Voir la semaine
      </Link>
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
    <div className="flex items-center gap-3">
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: zoneColor(step.zone) }} />
      <div className="flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          {STEP_LABEL[step.kind]} · Z{step.zone} {ZONE_NAMES[step.zone]}
        </p>
        <p className="font-semibold tabular-nums">{target}</p>
      </div>
      <p className="text-right text-sm font-semibold tabular-nums">{pace}</p>
    </div>
  )
}
