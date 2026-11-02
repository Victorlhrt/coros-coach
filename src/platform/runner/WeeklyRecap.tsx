import { useMutation } from '@tanstack/react-query'
import { Activity as ActivityIcon, CalendarCheck, HeartPulse, Loader2, RefreshCw, Smile, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { Skeleton } from '@/components/shadcn/skeleton'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { formatDay, today } from '@/lib/coach/dates'
import { buildRecap, lastFinishedWeek } from '@/lib/coach/recap'
import type { WeeklyRecap as RecapText } from '@/lib/coach/schema'
import { useActivities } from '@/lib/coros/activity-hooks'
import { usePlan } from '@/lib/store/plan'
import { cn } from '@/lib/utils'

/**
 * Onglet Coach : récap IA de la semaine écoulée (plan respecté, ressentis, douleurs, charge).
 * Rédigé une fois par semaine à la première visite, gardé avec le plan et synchronisé avec le compte.
 */

const ADHERENCE: Record<RecapText['adherence'], { label: string; tone: BadgeTone }> = {
  on_track: { label: 'Plan followed', tone: 'success' },
  partly: { label: 'Partly followed', tone: 'warning' },
  off_track: { label: 'Off plan', tone: 'danger' },
}

/** Une tentative automatique par semaine et par page : une erreur ne relance pas Claude en boucle. */
let attempted: number | null = null

export function WeeklyRecap({ className }: { className?: string }) {
  const plan = usePlan((s) => s.plan)
  const recaps = usePlan((s) => s.recaps) ?? {}
  const saveRecap = usePlan((s) => s.saveRecap)
  const activities = useActivities()
  const [now] = useState(today)
  const week = plan ? lastFinishedWeek(plan.weeks, now) : undefined
  const saved = week ? recaps[week.number] : undefined

  const generate = useMutation({
    mutationFn: () => buildRecap(week!.number, activities.data?.activities ?? []),
    onSuccess: (r) => saveRecap(week!.number, r),
  })
  const run = useRef(generate.mutate)
  run.current = generate.mutate

  const ready = !!week && !activities.isPending
  useEffect(() => {
    if (!ready || saved || attempted === week!.number) return
    attempted = week!.number
    run.current()
  }, [ready, saved, week])

  if (!plan || !week) return null
  const range = `${formatDay(week.start, { day: 'numeric', month: 'short' })} – ${formatDay(week.end, { day: 'numeric', month: 'short' })}`

  return (
    <Panel className={className}>
      <PanelHeader
        title={`Week ${week.number} recap`}
        subtitle={range}
        actions={
          <Badge size="sm" icon={<Sparkles className="size-3" />}>
            AI recap
          </Badge>
        }
      />
      {saved ? (
        <RecapBody recap={saved.recap} stats={saved.stats} />
      ) : generate.isError ? (
        <PanelSection divided>
          <p className="text-muted-foreground text-sm">Couldn’t write your recap: {claudeErrorMessage(generate.error)}</p>
        </PanelSection>
      ) : (
        <PanelSection divided className="space-y-3">
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Pacer is going over your week: sessions, splits, how you felt…
          </p>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-16" />
        </PanelSection>
      )}
      {(saved || generate.isError) && (
        <PanelFooter>
          <p className="text-muted-foreground text-xs">
            {saved ? `Written ${formatDay(saved.createdAt.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}
          </p>
          <Button variant="outline" size="sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {saved ? 'Rewrite' : 'Try again'}
          </Button>
        </PanelFooter>
      )}
    </Panel>
  )
}

function RecapBody({ recap, stats }: { recap: RecapText; stats: NonNullable<ReturnType<typeof usePlan.getState>['recaps'][number]>['stats'] }) {
  const adherence = ADHERENCE[recap.adherence]
  return (
    <>
      <div className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
        <Stat label="Sessions" value={`${stats.done} / ${stats.planned}`} />
        <Stat label="Distance" value={`${stats.km} km`} sub={`of ${stats.plannedKm} km planned`} />
        <Stat label="Avg effort (RPE)" value={stats.avgRpe !== null ? `${stats.avgRpe} / 10` : '—'} sub={`${stats.rated} session${stats.rated === 1 ? '' : 's'} rated`} />
        <Stat label="Pain reported" value={String(stats.pain)} alert={stats.pain > 0} />
      </div>
      <PanelSection divided className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl font-heading font-medium text-xl tracking-tight">{recap.headline}</p>
          <Badge tone={adherence.tone}>{adherence.label}</Badge>
        </div>
        {recap.pain && (
          <Section icon={<TriangleAlert />} title="Pain" className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4" iconClass="text-red-400">
            {recap.pain}
          </Section>
        )}
        <Section icon={<Smile />} title="How you felt" className="rounded-2xl border bg-foreground/[0.03] p-4">
          {recap.feelings}
        </Section>
        <div className="grid gap-5 md:grid-cols-2">
          <Section icon={<CalendarCheck />} title="Your plan">
            {recap.plan}
          </Section>
          <Section icon={<ActivityIcon />} title="Load">
            {recap.load}
          </Section>
        </div>
        <Section icon={<HeartPulse />} title="This week">
          {recap.nextWeek}
        </Section>
      </PanelSection>
    </>
  )
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="bg-card px-6 py-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('mt-0.5 font-medium text-xl tabular-nums tracking-tight', alert && 'text-red-400')}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  )
}

function Section({ icon, title, children, className, iconClass }: { icon: ReactNode; title: string; children: ReactNode; className?: string; iconClass?: string }) {
  return (
    <div className={className}>
      <p className={cn('flex items-center gap-2 font-medium text-sm [&>svg]:size-4', iconClass ?? '[&>svg]:text-muted-foreground')}>
        {icon}
        {title}
      </p>
      <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">{children}</p>
    </div>
  )
}
