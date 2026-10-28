import { useMutation } from '@tanstack/react-query'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { ArrowDown, ChevronLeft, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TypeBadge } from '@/components/TypeBadge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration, formatPace } from '@/lib/coach/format'
import { sessionTotals } from '@/lib/coach/metrics'
import { runReview } from '@/lib/coach/review'
import type { Adjustment, SessionInput, Zone } from '@/lib/coach/schema'
import { zonesFromThreshold } from '@/lib/coach/zones'
import { pushDays } from '@/lib/coros/sync'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/coach/routes'

export function AdjustPage() {
  const navigate = useNavigate()
  const store = usePlan()
  const [now] = useState(today)
  const week = store.plan?.weeks.find((w) => w.start <= now && w.end >= now)
  const review = week ? store.reviews[week.number] : undefined
  // Tout est coché par défaut : on retient seulement ce que l'utilisateur décoche.
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set())
  const [updateZones, setUpdateZones] = useState(true)

  const analyse = useMutation({
    mutationFn: runReview,
    onSuccess: () => setUnchecked(new Set()),
  })

  const apply = useMutation({
    mutationFn: async (changes: Adjustment['changes']) => {
      // Zones d'abord : les séances proposées par le bilan sont déjà écrites aux nouvelles allures.
      const pace = review?.adjustment.newThresholdPace
      let repaced: string[] = []
      if (pace && updateZones) {
        repaced = store.retuneZones(zonesFromThreshold(pace))
        if (store.profile) store.setProfile({ ...store.profile, thresholdPace: pace })
      }
      store.applyChanges(changes)
      if (week) store.setReviewStatus(week.number, 'applied')
      const { plan, coros } = usePlan.getState()
      const dates = [...changes.map((c) => c.date), ...repaced]
      if (!coros.created || !plan || dates.length === 0) return 'local'
      const sent = await pushDays(plan, dates, 'the adjusted sessions')
      return sent ? 'sent' : 'local'
    },
    onSuccess: (r) => {
      toast.success(r === 'sent' ? 'Week adjusted and sent to your watch ✓' : 'Week adjusted in the app')
      navigate(ROUTES.plan)
    },
    onError: (e) => {
      toast.error(e)
      navigate(ROUTES.plan)
    },
  })

  const result = review?.adjustment
  const chosen = result?.changes.filter((_, i) => !unchecked.has(i)) ?? []
  const pending = review?.status === 'pending'

  return (
    <div className="space-y-4 pb-4">
      <header className="flex items-center gap-2 pt-4">
        <Link to={ROUTES.plan} aria-label="Back" className="-ml-2 p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="font-heading text-2xl font-medium tracking-tight">Weekly review</h1>
      </header>

      {!result && !analyse.isPending && (
        <Card>
          <CardDescription>
            Pacer compares your planned sessions with your linked COROS activities and their splits, reads your recovery, HRV, sleep and resting HR, then
            suggests changes for the rest of the week. Nothing changes without your OK.
          </CardDescription>
          <Button className="mt-4 w-full" onClick={() => analyse.mutate()}>
            <Wand2 className="size-5" /> Analyse my week
          </Button>
        </Card>
      )}
      {analyse.error && <Card className="text-sm text-destructive whitespace-pre-line">{claudeErrorMessage(analyse.error)}</Card>}

      {analyse.isPending && (
        <div className="space-y-3">
          <TextShimmer as="p" className="px-1 text-sm">
            Reading activities, splits and recovery…
          </TextShimmer>
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {result && !analyse.isPending && (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <p className="font-medium">Review</p>
              <p className="text-xs text-muted-foreground">
                {new Date(review!.createdAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                {review!.status === 'applied' && ' · applied'}
                {review!.status === 'dismissed' && ' · dismissed'}
              </p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>
          </Card>

          {result.newThresholdPace && pending && (
            <Card>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-[var(--accent)]"
                  checked={updateZones}
                  onChange={(e) => setUpdateZones(e.target.checked)}
                />
                <div>
                  <p className="font-medium">New threshold pace: {formatPace(result.newThresholdPace)} /km</p>
                  <p className="text-sm text-muted-foreground">
                    {store.profile?.thresholdPace ? `Current: ${formatPace(store.profile.thresholdPace)} /km. ` : ''}Recalculates your pace zones and the
                    target paces of upcoming sessions (except race pace).
                  </p>
                </div>
              </label>
            </Card>
          )}

          {result.changes.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">No changes needed. Keep going as planned.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {result.changes.map((c, i) => (
                <ChangeCard
                  key={i}
                  change={c}
                  checked={pending && !unchecked.has(i)}
                  disabled={!pending}
                  onToggle={() =>
                    setUnchecked((s) => {
                      const n = new Set(s)
                      if (n.has(i)) n.delete(i)
                      else n.add(i)
                      return n
                    })
                  }
                />
              ))}
            </div>
          )}

          {pending && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="w-full" disabled={(chosen.length === 0 && !result.newThresholdPace) || apply.isPending} onClick={() => apply.mutate(chosen)}>
                {chosen.length > 0 ? `Apply ${chosen.length} change${chosen.length > 1 ? 's' : ''}` : 'Update my zones'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => week && store.setReviewStatus(week.number, 'dismissed')}>
                Dismiss this review
              </Button>
            </div>
          )}
          <Button variant="secondary" className="w-full" onClick={() => analyse.mutate()}>
            <Wand2 className="size-5" /> Analyse again
          </Button>
        </>
      )}
    </div>
  )
}

function ChangeCard({
  change,
  checked,
  disabled,
  onToggle,
}: {
  change: Adjustment['changes'][number]
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const { plan, zones } = usePlan()
  const units = useSettings((s) => s.units)
  const before = allSessions(plan).filter((s) => s.date === change.date && s.type !== 'strength')
  const actionLabel = { replace: 'Changed', remove: 'Removed', add: 'Added' }[change.action]

  return (
    <Card className={cn('p-4 transition-opacity', !checked && !disabled && 'opacity-50')}>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={onToggle} />
        <div className="flex-1">
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            {actionLabel} · <span className="capitalize">{formatDay(change.date, { weekday: 'long', day: 'numeric' })}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{change.reason}</p>
        </div>
      </label>
      <div className="mt-3 space-y-1.5">
        <Version label="Before" session={before[0] ?? null} zones={zones} units={units} muted />
        <ArrowDown className="mx-auto size-4 text-muted-foreground" />
        <Version label="After" session={change.session} zones={zones} units={units} />
      </div>
    </Card>
  )
}

function Version({
  label,
  session,
  zones,
  units,
  muted,
}: {
  label: string
  session: SessionInput | null
  zones: Zone[]
  units: 'metric' | 'imperial'
  muted?: boolean
}) {
  const totals = session ? sessionTotals({ ...session, id: '' }, zones) : null
  return (
    <div className={cn('rounded-xl p-3', muted ? 'bg-muted/60 line-through decoration-muted-foreground/40' : 'bg-muted')}>
      <p className="text-[11px] font-medium text-muted-foreground uppercase no-underline">{label}</p>
      {session ? (
        <>
          <div className="mt-1 flex items-center gap-2">
            <TypeBadge type={session.type} />
            <span className="font-medium">{session.title}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDuration(totals!.seconds)}
            {totals!.meters > 0 && ` · ${formatDistance(totals!.meters, units)}`}
          </p>
        </>
      ) : (
        <p className="mt-1 font-medium">Rest</p>
      )}
    </div>
  )
}
