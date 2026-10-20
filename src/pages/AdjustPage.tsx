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
      const sent = await pushDays(plan, dates, 'les séances ajustées')
      return sent ? 'sent' : 'local'
    },
    onSuccess: (r) => {
      toast.success(r === 'sent' ? 'Semaine ajustée et envoyée sur la montre ✓' : 'Semaine ajustée dans l’app')
      navigate('/plan')
    },
    onError: (e) => {
      toast.error(e)
      navigate('/plan')
    },
  })

  const result = review?.adjustment
  const chosen = result?.changes.filter((_, i) => !unchecked.has(i)) ?? []
  const pending = review?.status === 'pending'

  return (
    <div className="space-y-4 pb-4">
      <header className="flex items-center gap-2 pt-4">
        <Link to="/plan" aria-label="Retour" className="-ml-2 p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="text-3xl font-medium tracking-tight">Bilan de la semaine</h1>
      </header>

      {!result && !analyse.isPending && (
        <Card>
          <CardDescription>
            Claude compare tes séances prévues avec les activités COROS liées et leurs splits, lit ta récupération, ta HRV, ton
            sommeil et ta FC de repos, puis propose des changements pour le reste de la semaine. Rien n’est modifié sans ton accord.
          </CardDescription>
          <Button className="mt-4 w-full" onClick={() => analyse.mutate()}>
            <Wand2 className="size-5" /> Analyser ma semaine
          </Button>
        </Card>
      )}
      {analyse.error && <Card className="text-sm text-destructive whitespace-pre-line">{claudeErrorMessage(analyse.error)}</Card>}

      {analyse.isPending && (
        <div className="space-y-3">
          <TextShimmer as="p" className="px-1 text-sm">Lecture des activités, des splits et de la récupération…</TextShimmer>
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {result && !analyse.isPending && (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <p className="font-medium">Bilan</p>
              <p className="text-xs text-muted-foreground">
                {new Date(review!.createdAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                {review!.status === 'applied' && ' · appliqué'}
                {review!.status === 'dismissed' && ' · ignoré'}
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
                  <p className="font-medium">Nouvelle allure seuil : {formatPace(result.newThresholdPace)} /km</p>
                  <p className="text-sm text-muted-foreground">
                    {store.profile?.thresholdPace ? `Actuelle : ${formatPace(store.profile.thresholdPace)} /km. ` : ''}Recalcule tes zones
                    d’allure et les allures cibles des séances à venir (sauf l’allure course).
                  </p>
                </div>
              </label>
            </Card>
          )}

          {result.changes.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">Aucun changement nécessaire. Continue comme prévu.</p>
          ) : (
            result.changes.map((c, i) => (
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
            ))
          )}

          {pending && (
            <>
              <Button
                className="w-full"
                disabled={(chosen.length === 0 && !result.newThresholdPace) || apply.isPending}
                onClick={() => apply.mutate(chosen)}
              >
                {chosen.length > 0 ? `Appliquer ${chosen.length} changement${chosen.length > 1 ? 's' : ''}` : 'Mettre à jour mes zones'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => week && store.setReviewStatus(week.number, 'dismissed')}>
                Ignorer ce bilan
              </Button>
            </>
          )}
          <Button variant="secondary" className="w-full" onClick={() => analyse.mutate()}>
            <Wand2 className="size-5" /> Analyser à nouveau
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
  const actionLabel = { replace: 'Modifiée', remove: 'Supprimée', add: 'Ajoutée' }[change.action]

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
        <Version label="Avant" session={before[0] ?? null} zones={zones} units={units} muted />
        <ArrowDown className="mx-auto size-4 text-muted-foreground" />
        <Version label="Après" session={change.session} zones={zones} units={units} />
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
        <p className="mt-1 font-medium">Repos</p>
      )}
    </div>
  )
}
