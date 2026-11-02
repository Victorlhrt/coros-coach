import { useMutation } from '@tanstack/react-query'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog'
import { Button } from '@/components/shadcn/button'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { formatDay, planWeeks, today } from '@/lib/coach/dates'
import { PLAN_GENERATOR, clearDraft, generatePlan, markDraftFailed, type Progress } from '@/lib/coach/generate'
import { computeVolume } from '@/lib/coach/volume'
import { useActivities } from '@/lib/coros/activity-hooks'
import { usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'

/**
 * À l'ouverture de l'app, un plan écrit avant les nouvelles règles de génération (périodisation selon la durée)
 * se voit proposer une mise à jour : on explique ce qui changerait pour ce plan-là, et seules les semaines à venir
 * sont réécrites (semaines passées, activités liées et ressentis gardés). Proposé une fois par plan.
 */

const seenKey = (planId: string) => `plan-update.v${PLAN_GENERATOR}.${planId}`
function seen(planId: string) {
  try {
    return localStorage.getItem(seenKey(planId)) === '1'
  } catch {
    return false
  }
}
function markSeen(planId: string) {
  try {
    localStorage.setItem(seenKey(planId), '1')
  } catch {
    /* sans stockage, la proposition reviendra */
  }
}

function changesFor(weeks: number) {
  if (weeks <= 6)
    return [
      'Short plans no longer start with easy base weeks: intervals, threshold and race-pace work start in week 1.',
      'At least one real quality session every week, two in build weeks.',
      'No easy week in the middle: only the taper eases off, and it keeps a short sharp session.',
    ]
  if (weeks <= 9)
    return [
      'The base phase is cut to one or two weeks, already with light quality (hills, fartlek, short threshold).',
      'At least one real quality session every week.',
      'One easier week at most before the taper.',
    ]
  return [
    'A longer, more gradual build-up: 3 to 6 weeks of base with strides and short hills before hard intervals.',
    'Quality sessions then build progressively, volume first, intensity second.',
    'A taper sized to your race: one week for a 10 km, two to three for a marathon.',
  ]
}

export function PlanUpdateModal() {
  const plan = usePlan((s) => s.plan)
  const goal = usePlan((s) => s.goal)
  const activities = useActivities()
  const [now] = useState(today)
  const [closed, setClosed] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)

  const update = useMutation({
    mutationFn: async () => {
      const { goal, profile, zones, records } = usePlan.getState()
      if (!goal) throw new Error('No goal found for this plan.')
      // Le volume de départ suit ce que le coureur court aujourd'hui, pas celui du jour de la création du plan.
      const recent = computeVolume(activities.data?.activities ?? [], now)
      const current = Math.round(Math.max(recent.avg4w, recent.lastMonthWeekly))
      const fresh = { ...goal, currentWeeklyKm: current > 0 ? current : goal.currentWeeklyKm }
      return generatePlan(fresh, profile, zones, setProgress, records, null)
    },
    onSuccess: (next) => {
      // Brouillon de génération effacé : la page Goal ne doit pas le reprendre.
      clearDraft()
      usePlan.getState().replaceUpcoming(next)
      if (plan) markSeen(plan.id)
      setClosed(true)
      toast.success('Your plan is updated')
    },
    onError: () => markDraftFailed(),
    onSettled: () => setProgress(null),
  })

  if (!plan || !goal || plan.generator || closed || seen(plan.id)) return null
  // La regénération demande une course à au moins 4 semaines.
  const slots = planWeeks(goal.raceDate, now)
  if (slots.error || !slots.weeks.length) return null

  const upcoming = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date >= slots.start)
  const quality = upcoming.filter((s) => s.type === 'interval' || s.type === 'tempo').length
  const busy = update.isPending

  const dismiss = () => {
    if (busy) return
    markSeen(plan.id)
    setClosed(true)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()}>
      <DialogContent title="Your plan can get better" description="We changed how training plans are built. Here’s what it would change for yours.">
        <div className="space-y-5">
          <ul className="space-y-2.5">
            {changesFor(plan.weeks.length).map((c) => (
              <li key={c} className="flex gap-2.5 text-sm">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>{c}</span>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border bg-foreground/[0.03] p-4 text-sm">
            <p>
              Right now, your next {slots.weeks.length} weeks have <strong>{quality} quality session{quality === 1 ? '' : 's'}</strong>.
            </p>
            <p className="mt-2 flex gap-2 text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              Your past weeks, linked activities and feelings stay. Only the weeks from {formatDay(slots.start, { weekday: 'short', day: 'numeric', month: 'short' })} are rewritten, for the same race.
            </p>
          </div>

          {update.isError && <p className="text-destructive text-sm">{claudeErrorMessage(update.error)}</p>}
          {busy && (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" /> {progress?.step ?? 'Starting'}… This takes about a minute.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={dismiss}>
              Keep my plan
            </Button>
            <Button disabled={busy} onClick={() => update.mutate()}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Update my plan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
