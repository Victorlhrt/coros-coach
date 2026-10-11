import { ArrowRight, Moon, Sparkles, Wand2 } from 'lucide-react'
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
import { formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration } from '@/lib/coach/format'
import { isRun, sessionTotals, weekMeters } from '@/lib/coach/metrics'
import type { Session } from '@/lib/coach/schema'
import { useActivities } from '@/lib/coros/activity-hooks'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'

export function TodayPage() {
  const { plan, zones } = usePlan()
  const connected = useCorosAuth((s) => s.connected)
  const units = useSettings((s) => s.units)
  const activities = useActivities()
  const [now] = useState(today)

  if (!plan) {
    return (
      <>
        <PageHeader subtitle={formatDay(now)} title="Aujourd’hui" />
        <Card>
          <EmptyState icon={Sparkles} title="Pas encore de plan">
            {connected ? 'Fixe ton objectif et Claude construit ton plan à partir de tes données COROS.' : 'Connecte d’abord ta montre COROS dans Réglages.'}
          </EmptyState>
          <Link to={connected ? '/objectif' : '/reglages'} className="block">
            <Button className="w-full">{connected ? 'Créer mon plan' : 'Connecter COROS'}</Button>
          </Link>
        </Card>
      </>
    )
  }

  const week = plan.weeks.find((w) => w.start <= now && w.end >= now)
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
                <p className="mt-1 text-2xl font-extrabold tracking-tight">Jour de repos</p>
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
            <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight">
              {activities.isLoading ? <Skeleton className="h-9 w-32" /> : formatDistance(done, units)}
              <span className="text-lg font-semibold text-muted-foreground"> / {formatDistance(planned, units, 0)}</span>
            </p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                key={done}
                className="animate-grow-x h-full rounded-full bg-accent"
                style={{ width: `${planned ? Math.min(100, (done / planned) * 100) : 0}%` }}
              />
            </div>
            <Link to="/ajuster" className="mt-4 block">
              <Button variant="secondary" className="w-full">
                <Wand2 className="size-5" /> Ajuster ma semaine
              </Button>
            </Link>
          </Card>
        )}

        {next && (
          <div>
            <p className="mb-2 px-1 text-sm font-semibold text-muted-foreground">Prochaine séance</p>
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
      <h2 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight">{session.title}</h2>
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
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-4xl font-extrabold tabular-nums tracking-tight">{value}</p>
    </div>
  )
}
