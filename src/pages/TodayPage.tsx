import { ArrowRight, Moon, Sparkles, Star, Wand2 } from 'lucide-react'
import { Progress } from '@/components/arc/progress/progress'
import { SlotText } from '@/components/arc/slot-text/slot-text'
import { TextReveal } from '@/components/arc/text-reveal/text-reveal'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SessionCard } from '@/components/SessionCard'
import { TypeBadge } from '@/components/TypeBadge'
import { WorkoutChart } from '@/components/WorkoutChart'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration } from '@/lib/coach/format'
import { isRun, sessionTotals, weekMeters } from '@/lib/coach/metrics'
import type { Session } from '@/lib/coach/schema'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'

export function TodayPage() {
  const { plan, zones, reviews, feedback, links } = usePlan()
  const connected = useCorosAuth((s) => s.connected)
  const units = useSettings((s) => s.units)
  const activities = useActivities()
  const [now] = useState(today)

  if (!plan) {
    return (
      <>
        <PageHeader subtitle={formatDay(now)} title="Aujourd’hui" />
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Pas encore de plan"
            action={
              <Link to={connected ? '/objectif' : '/reglages'}>
                <Button>{connected ? 'Créer mon plan' : 'Connecter COROS'}</Button>
              </Link>
            }
          >
            {connected ? 'Fixe ton objectif et Claude construit ton plan à partir de tes données COROS.' : 'Connecte d’abord ta montre COROS dans Réglages.'}
          </EmptyState>
        </Card>
      </>
    )
  }

  const week = plan.weeks.find((w) => w.start <= now && w.end >= now)
  const review = week ? reviews[week.number] : undefined
  // Dernière séance des 3 derniers jours sans ressenti : on propose de la noter.
  const toRate = allSessions(plan)
    .filter((s) => s.date <= now && s.date >= addDays(now, -3) && !feedback[s.id] && (s.type === 'strength' || links[s.id]?.labelId))
    .at(-1)
  const todays = allSessions(plan).filter((s) => s.date === now)
  const next = allSessions(plan).find((s) => s.date > now)
  const planned = week ? weekMeters(week.sessions.filter(isRun), zones) : 0
  const done = week
    ? (activities.data?.activities ?? []).filter((a) => a.date >= week.start && a.date <= week.end).reduce((a, x) => a + (x.meters ?? 0), 0)
    : 0

  return (
    <>
      <PageHeader subtitle={formatDay(now)} title="Aujourd’hui" />
      <div className="space-y-4">
        {review?.status === 'pending' && (
          <Link to="/ajuster" className="block">
            <Card className="flex items-center gap-3 bg-accent text-accent-foreground">
              <Wand2 className="size-6 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Ton bilan de la semaine est prêt</p>
                <p className="text-sm opacity-85">
                  {review.adjustment.changes.length > 0
                    ? `${review.adjustment.changes.length} ajustement${review.adjustment.changes.length > 1 ? 's' : ''} proposé${review.adjustment.changes.length > 1 ? 's' : ''}`
                    : 'Rien à changer, consulte l’analyse'}
                </p>
              </div>
              <ArrowRight className="size-5" />
            </Card>
          </Link>
        )}

        {toRate && (
          <Link to={`/seance/${toRate.id}#ressenti`} className="block">
            <Card className="flex items-center gap-3">
              <Star className="size-6 shrink-0 text-accent" />
              <div className="flex-1">
                <p className="font-medium">Comment s’est passée ta séance ?</p>
                <p className="text-sm text-muted-foreground">
                  {toRate.title} · <span className="capitalize">{formatDay(toRate.date, { weekday: 'long' })}</span>
                </p>
              </div>
              <ArrowRight className="size-5 text-muted-foreground" />
            </Card>
          </Link>
        )}

        {todays.length > 0 ? (
          todays.map((s) => <TodayCard key={s.id} session={s} />)
        ) : (
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                <Moon className="size-6 text-session-rest" />
              </div>
              <div>
                <TypeBadge type="rest" />
                <p className="mt-1 text-2xl font-medium tracking-tight">Jour de repos</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">La récupération fait partie de l’entraînement.</p>
          </Card>
        )}

        {week && (
          <Card>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Semaine {week.number}/{plan.weeks.length}
              </p>
              <p className="text-sm text-muted-foreground">{week.focus}</p>
            </div>
            <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight">
              {activities.isLoading ? <Skeleton className="h-9 w-32" /> : <SlotText value={formatDistance(done, units)} />}
              <span className="text-lg font-medium text-muted-foreground"> / {formatDistance(planned, units, 0)}</span>
            </p>
            <Progress className="mt-3" value={done} max={planned || 1} label="Volume réalisé cette semaine" showValue />
            <Link to="/ajuster" className="mt-4 block">
              <Button variant="secondary" className="w-full">
                <Wand2 className="size-5" /> Ajuster ma semaine
              </Button>
            </Link>
          </Card>
        )}

        {next && (
          <div>
            <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">Prochaine séance</p>
            <SessionCard session={next} />
          </div>
        )}
      </div>
    </>
  )
}

function TodayCard({ session }: { session: Session }) {
  const zones = usePlan((s) => s.zones)
  const units = useSettings((s) => s.units)
  const { seconds, meters } = sessionTotals(session, zones)
  return (
    <Card className="overflow-hidden">
      <TypeBadge type={session.type} />
      <TextReveal as="h2" text={session.title} className="mt-2 text-3xl leading-tight font-medium tracking-tight" />
      <p className="mt-2 text-muted-foreground">{session.description}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <BigStat label="Durée" value={formatDuration(seconds)} />
        <BigStat label={meters > 0 ? 'Distance estimée' : 'Type'} value={meters > 0 ? formatDistance(meters, units) : 'Renfo'} />
      </div>
      {session.blocks.length > 0 && <WorkoutChart blocks={session.blocks} zones={zones} className="mt-5 h-16" />}
      <Link to={`/seance/${session.id}`} className="mt-5 block">
        <Button className="w-full">
          Voir le détail <ArrowRight className="size-5" />
        </Button>
      </Link>
    </Card>
  )
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <SlotText value={value} className="text-4xl font-medium tracking-tight" />
    </div>
  )
}
