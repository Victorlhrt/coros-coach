import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity as ActivityIcon, CalendarCheck, Compass, Loader2, Smile, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { Panel, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Skeleton } from '@/components/shadcn/skeleton'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { formatDay, today } from '@/lib/coach/dates'
import { buildRecap, lastFinishedWeek, type Recap } from '@/lib/coach/recap'
import type { WeeklyRecap as RecapText } from '@/lib/coach/schema'
import { useActivities } from '@/lib/coros/activity-hooks'
import { api } from '@/platform/api'
import { usePlan } from '@/lib/store/plan'
import { cn } from '@/lib/utils'

/**
 * Onglet Coach : récap IA de la semaine écoulée (plan respecté, ressentis, douleurs, charge).
 * Rédigé une seule fois par semaine, à la première visite, et gardé sur le serveur : tous les appareils lisent le même.
 */

const ADHERENCE: Record<RecapText['adherence'], { label: string; tone: BadgeTone }> = {
  on_track: { label: 'Plan followed', tone: 'success' },
  partly: { label: 'Partly followed', tone: 'warning' },
  off_track: { label: 'Off plan', tone: 'danger' },
}

/** Une rédaction au plus par semaine et par page : une erreur ne relance pas Claude en boucle. */
let attempted: string | null = null

export function WeeklyRecap({ className }: { className?: string }) {
  const plan = usePlan((s) => s.plan)
  const activities = useActivities()
  const qc = useQueryClient()
  const [now] = useState(today)
  const week = plan ? lastFinishedWeek(plan.weeks, now) : undefined
  const path = plan && week ? `/account/recaps/${encodeURIComponent(plan.id)}/${week.number}` : null

  const saved = useQuery({
    queryKey: ['recap', path],
    queryFn: () => api<{ recap: Recap | null }>(path!).then((r) => r.recap),
    enabled: !!path,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const write = useMutation({
    mutationFn: async () => {
      const recap = await buildRecap(week!.number, activities.data?.activities ?? [])
      // Si un autre appareil l'a écrit entre-temps, le serveur garde le premier et le renvoie.
      return (await api<{ recap: Recap | null }>(path!, { method: 'PUT', body: { recap } })).recap ?? recap
    },
    onSuccess: (r) => qc.setQueryData(['recap', path], r),
  })
  const run = useRef(write.mutate)
  run.current = write.mutate

  const missing = saved.isSuccess && saved.data === null
  useEffect(() => {
    if (!path || !missing || activities.isPending || attempted === path) return
    attempted = path
    run.current()
  }, [path, missing, activities.isPending])

  if (!plan || !week) return null
  const recap = saved.data
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
      {recap ? (
        <RecapBody recap={recap} />
      ) : write.isError || saved.isError ? (
        <PanelSection divided>
          <p className="text-muted-foreground text-sm">Couldn’t write your recap: {claudeErrorMessage(write.error ?? saved.error)}</p>
        </PanelSection>
      ) : (
        <PanelSection divided className="space-y-3">
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Josh is going over your week…
          </p>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-12" />
        </PanelSection>
      )}
    </Panel>
  )
}

function RecapBody({ recap: { recap, stats } }: { recap: Recap }) {
  const adherence = ADHERENCE[recap.adherence]
  const figures = [
    `${stats.done}/${stats.planned} sessions`,
    `${stats.km} of ${stats.plannedKm} km`,
    stats.avgRpe !== null ? `RPE ${stats.avgRpe}` : null,
    stats.pain > 0 ? `${stats.pain} pain report${stats.pain > 1 ? 's' : ''}` : null,
  ].filter(Boolean)
  return (
    <PanelSection divided className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm" tone={adherence.tone}>
            {adherence.label}
          </Badge>
          <span className="text-muted-foreground text-xs tabular-nums">{figures.join(' · ')}</span>
        </div>
        <p className="font-heading font-medium text-lg leading-snug tracking-tight">{recap.headline}</p>
      </div>
      <ul className="space-y-2.5">
        {recap.pain && (
          <Line icon={<TriangleAlert />} label="Pain" alert>
            {recap.pain}
          </Line>
        )}
        <Line icon={<Smile />} label="Feel">
          {recap.feelings}
        </Line>
        <Line icon={<CalendarCheck />} label="Plan">
          {recap.plan}
        </Line>
        <Line icon={<ActivityIcon />} label="Load">
          {recap.load}
        </Line>
        <Line icon={<Compass />} label="Next">
          {recap.nextWeek}
        </Line>
      </ul>
    </PanelSection>
  )
}

function Line({ icon, label, alert, children }: { icon: ReactNode; label: string; alert?: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex gap-3 text-sm', alert && 'rounded-xl bg-red-500/[0.08] p-2.5 -mx-2.5')}>
      <span className={cn('flex w-16 shrink-0 items-center gap-1.5 font-medium [&>svg]:size-3.5', alert ? 'text-red-400' : '[&>svg]:text-muted-foreground')}>
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-muted-foreground leading-relaxed">{children}</span>
    </li>
  )
}
