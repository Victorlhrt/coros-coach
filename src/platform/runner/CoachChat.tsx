import { useMutation } from '@tanstack/react-query'
import { ArrowUp, Sparkles, Wand2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/arc/badge/badge'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { formatDay, today } from '@/lib/coach/dates'
import { formatPace } from '@/lib/coach/format'
import { runReview } from '@/lib/coach/review'
import { ROUTES } from '@/lib/coach/routes'
import type { Adjustment } from '@/lib/coach/schema'
import { zonesFromThreshold } from '@/lib/coach/zones'
import { pushDays } from '@/lib/coros/sync'
import { allSessions, usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { ChangeCard } from '@/pages/AdjustPage'
import { CoachAvatar } from '../onboarding/CoachAvatar'

/**
 * Pacer, le coach : une seule carte en forme de conversation. Le bilan de la semaine s'y déroule
 * comme un échange (analyse, ajustements proposés, application) ; le chat libre arrive ensuite,
 * d'où le champ de saisie désactivé.
 */

const SUGGESTIONS = ['Move tomorrow’s session', 'My calf hurts', 'Busy week at work', 'Can I race this weekend?']

function Bubble({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-fit max-w-[92%] rounded-2xl rounded-bl-md border bg-background px-4 py-2.5 text-sm sm:max-w-[85%]', className)}>{children}</div>
}

export function CoachChat({ firstName, className }: { firstName?: string; className?: string }) {
  const plan = usePlan((s) => s.plan)
  const now = today()
  const next = plan ? allSessions(plan).find((s) => s.date >= now) : undefined
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader
        title={
          <span className="flex items-center gap-3">
            <CoachAvatar className="size-9" />
            <span>
              <span className="block font-medium text-sm">Pacer</span>
              <span className="block font-normal text-muted-foreground text-xs">Your AI coach</span>
            </span>
          </span>
        }
      />
      <PanelSection divided className="flex min-h-80 flex-1 flex-col justify-end gap-2.5">
        <Bubble>Hi{firstName ? ` ${firstName}` : ''}! I’m Pacer, your coach.</Bubble>
        <Bubble>{plan ? `We’re building towards ${plan.name}.${next ? ` Next up: ${next.title}.` : ''}` : 'I’m preparing your plan from your answers.'}</Bubble>
        {plan && <WeeklyReview />}
      </PanelSection>
      <PanelFooter className="flex-col items-stretch gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">Soon: move a session, flag a niggle or tell me your week is packed, and I’ll rework the plan.</p>
          <Badge size="sm" tone="info" icon={<Sparkles className="size-3" />} className="shrink-0">
            Coming soon
          </Badge>
        </div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {SUGGESTIONS.map((s) => (
            <span key={s} className="shrink-0 cursor-not-allowed rounded-full border px-3 py-1.5 text-muted-foreground text-xs">
              {s}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-[18px] border bg-background p-1.5 pl-4">
          <span className="flex-1 truncate text-muted-foreground text-sm">Chat with Pacer is coming soon…</span>
          <button type="button" disabled aria-label="Send" className="flex size-9 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </PanelFooter>
    </Panel>
  )
}

/** Bilan de la semaine dans le fil : Pacer propose l'analyse, puis montre ses ajustements à valider. */
function WeeklyReview() {
  const navigate = useNavigate()
  const store = usePlan()
  const [now] = useState(today)
  const week = store.plan?.weeks.find((w) => w.start <= now && w.end >= now)
  const review = week ? store.reviews[week.number] : undefined
  // Tout est coché par défaut : on retient seulement ce que l'utilisateur décoche.
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set())
  const [updateZones, setUpdateZones] = useState(true)

  const analyse = useMutation({ mutationFn: runReview, onSuccess: () => setUnchecked(new Set()) })
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
      return (await pushDays(plan, dates, 'the adjusted sessions')) ? 'sent' : 'local'
    },
    onSuccess: (r) => {
      toast.success(r === 'sent' ? 'Week adjusted and sent to your watch ✓' : 'Week adjusted in the app')
      navigate(ROUTES.plan)
    },
    onError: (e) => toast.error(e),
  })

  if (!week) return null
  const result = review?.adjustment
  const chosen = result?.changes.filter((_, i) => !unchecked.has(i)) ?? []
  const pending = review?.status === 'pending'

  return (
    <>
      {!result && (
        <Bubble>
          <p>
            Each week I compare your planned sessions with your COROS activities and splits, and read your recovery, HRV, sleep and resting HR. Then I suggest
            changes for the rest of the week. Nothing changes without your OK.
          </p>
          {!analyse.isPending && (
            <Button size="sm" className="mt-3" onClick={() => analyse.mutate()}>
              <Wand2 /> Review week {week.number}
            </Button>
          )}
        </Bubble>
      )}
      {analyse.isPending && (
        <Bubble>
          <TextShimmer as="p" className="text-sm">
            Reading activities, splits and recovery…
          </TextShimmer>
        </Bubble>
      )}
      {analyse.error && <Bubble className="whitespace-pre-line text-destructive">{claudeErrorMessage(analyse.error)}</Bubble>}

      {result && !analyse.isPending && (
        <>
          <Bubble>
            <p className="mb-1 text-muted-foreground text-xs">
              Week {week.number} review · {formatDay(review!.createdAt.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}
              {review!.status === 'applied' && ' · applied'}
              {review!.status === 'dismissed' && ' · dismissed'}
            </p>
            <p className="whitespace-pre-line leading-relaxed">{result.summary}</p>
            {result.changes.length === 0 && <p className="mt-2 font-medium">No changes needed. Keep going as planned.</p>}
          </Bubble>

          {result.newThresholdPace && pending && (
            <label className="flex max-w-[92%] items-start gap-3 rounded-2xl border bg-background p-4 text-sm sm:max-w-[85%]">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={updateZones} onChange={(e) => setUpdateZones(e.target.checked)} />
              <span>
                <span className="block font-medium">New threshold pace: {formatPace(result.newThresholdPace)} /km</span>
                <span className="block text-muted-foreground text-xs">
                  {store.profile?.thresholdPace ? `Current: ${formatPace(store.profile.thresholdPace)} /km. ` : ''}Recalculates your zones and upcoming target paces.
                </span>
              </span>
            </label>
          )}

          {result.changes.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
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

          <div className="flex flex-wrap gap-2">
            {pending && (
              <>
                <Button size="sm" disabled={(chosen.length === 0 && !result.newThresholdPace) || apply.isPending} onClick={() => apply.mutate(chosen)}>
                  {chosen.length > 0 ? `Apply ${chosen.length} change${chosen.length > 1 ? 's' : ''}` : 'Update my zones'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => store.setReviewStatus(week.number, 'dismissed')}>
                  Dismiss
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => analyse.mutate()}>
              <Wand2 /> Analyse again
            </Button>
          </div>
        </>
      )}
    </>
  )
}
