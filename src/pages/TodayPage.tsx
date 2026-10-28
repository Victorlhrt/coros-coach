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
import { ROUTES } from '@/lib/coach/routes'

export function TodayPage() {
  const { plan, zones, reviews, feedback, links } = usePlan()
  const connected = useCorosAuth((s) => s.connected)
  const units = useSettings((s) => s.units)
  const activities = useActivities()
  const [now] = useState(today)

  if (!plan) {
    return (
      <>
        <PageHeader subtitle={formatDay(now)} title="Today" />
        <Card>
          <EmptyState
            icon={Sparkles}
            title="No plan yet"
            action={
              <Link to={connected ? ROUTES.goal : ROUTES.settings}>
                <Button>{connected ? 'Create my plan' : 'Connect COROS'}</Button>
              </Link>
            }
          >
            {connected ? 'Set your goal and Pacer builds your plan from your COROS data.' : 'First, connect your COROS watch in Settings.'}
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
  const done = week ? (activities.data?.activities ?? []).filter((a) => a.date >= week.start && a.date <= week.end).reduce((a, x) => a + (x.meters ?? 0), 0) : 0

  return (
    <>
      <PageHeader subtitle={formatDay(now)} title="Today" />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {(review?.status === 'pending' || toRate) && (
          <div className="grid gap-4 md:grid-cols-2 lg:col-span-3">
            {review?.status === 'pending' && (
              <Link to={ROUTES.adjust} className="block">
                <Card className="flex items-center gap-3 bg-accent text-accent-foreground">
                  <Wand2 className="size-6 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">Your weekly review is ready</p>
                    <p className="text-sm opacity-85">
                      {review.adjustment.changes.length > 0
                        ? `${review.adjustment.changes.length} suggested adjustment${review.adjustment.changes.length > 1 ? 's' : ''}`
                        : 'Nothing to change, see the analysis'}
                    </p>
                  </div>
                  <ArrowRight className="size-5" />
                </Card>
              </Link>
            )}

            {toRate && (
              <Link to={`${ROUTES.session(toRate.id)}#ressenti`} className="block">
                <Card className="flex items-center gap-3">
                  <Star className="size-6 shrink-0 text-accent" />
                  <div className="flex-1">
                    <p className="font-medium">How did your session go?</p>
                    <p className="text-sm text-muted-foreground">
                      {toRate.title} · <span className="capitalize">{formatDay(toRate.date, { weekday: 'long' })}</span>
                    </p>
                  </div>
                  <ArrowRight className="size-5 text-muted-foreground" />
                </Card>
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-col gap-4 lg:col-span-2">
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
                  <p className="mt-1 text-2xl font-medium tracking-tight">Rest day</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Recovery is part of training.</p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <GoalCard />
          {week && (
            <Card>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Week {week.number}/{plan.weeks.length}
                </p>
                <p className="text-sm text-muted-foreground">{week.focus}</p>
              </div>
              <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight">
                {activities.isLoading ? <Skeleton className="h-9 w-32" /> : <SlotText value={formatDistance(done, units)} />}
                <span className="text-lg font-medium text-muted-foreground"> / {formatDistance(planned, units, 0)}</span>
              </p>
              <Progress className="mt-3" value={done} max={planned || 1} label="Volume completed this week" showValue />
              <Link to={ROUTES.adjust} className="mt-4 block">
                <Button variant="secondary" className="w-full">
                  <Wand2 className="size-5" /> Adjust my week
                </Button>
              </Link>
            </Card>
          )}

          {next && (
            <div>
              <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">Next session</p>
              <SessionCard session={next} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** Objectif : la course, le compte à rebours, le temps visé et l'avancement du plan. */
function GoalCard() {
  const { plan, goal } = usePlan()
  const [now] = useState(today)
  if (!plan) return null
  const daysLeft = Math.max(0, Math.round((Date.parse(plan.raceDate) - Date.parse(now)) / 86_400_000))
  const current = plan.weeks.find((w) => w.start <= now && w.end >= now)?.number ?? (now > plan.raceDate ? plan.weeks.length : 0)
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-muted-foreground">Goal</p>
        <Link to={ROUTES.goal} className="text-sm text-muted-foreground hover:text-foreground">
          Edit
        </Link>
      </div>
      <p className="mt-2 text-2xl leading-tight font-medium tracking-tight">{plan.name}</p>
      <p className="mt-1 text-sm text-muted-foreground capitalize">{formatDay(plan.raceDate, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <BigStat label="Race day" value={daysLeft === 0 ? 'Race day' : `D-${daysLeft}`} />
        <BigStat label="Target time" value={goal?.targetTime ? formatDuration(goal.targetTime) : '—'} />
      </div>
      <Progress className="mt-5" value={current} max={plan.weeks.length} label={`Week ${current} of ${plan.weeks.length}`} showValue />
    </Card>
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
      <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-lg">
        <BigStat label="Duration" value={formatDuration(seconds)} />
        <BigStat label={meters > 0 ? 'Estimated distance' : 'Type'} value={meters > 0 ? formatDistance(meters, units) : 'Strength'} />
      </div>
      {session.blocks.length > 0 && <WorkoutChart blocks={session.blocks} zones={zones} className="mt-5 h-16 lg:h-28" />}
      <Link to={ROUTES.session(session.id)} className="mt-5 block sm:w-fit">
        <Button className="w-full sm:px-8">
          View details <ArrowRight className="size-5" />
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
