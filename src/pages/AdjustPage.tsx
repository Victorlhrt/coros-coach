import { useMutation } from '@tanstack/react-query'
import { ArrowDown, ChevronLeft, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TypeBadge } from '@/components/TypeBadge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { proposeAdjustment } from '@/lib/coach/adapt'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { formatDay } from '@/lib/coach/dates'
import { formatDistance, formatDuration } from '@/lib/coach/format'
import { sessionTotals } from '@/lib/coach/metrics'
import type { Adjustment, SessionInput, Zone } from '@/lib/coach/schema'
import { fetchRecentData } from '@/lib/coros/data'
import { pushDays } from '@/lib/coros/sync'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function AdjustPage() {
  const navigate = useNavigate()
  const store = usePlan()
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const analyse = useMutation({
    mutationFn: async () => {
      if (!store.plan || !store.goal) throw new Error('Crée d’abord un plan.')
      const recent = await fetchRecentData()
      return proposeAdjustment({ plan: store.plan, goal: store.goal, profile: store.profile, zones: store.zones, recent })
    },
    onSuccess: (a) => setSelected(new Set(a.changes.map((_, i) => i))),
  })

  const apply = useMutation({
    mutationFn: async (changes: Adjustment['changes']) => {
      store.applyChanges(changes)
      const { plan, coros } = usePlan.getState()
      if (!coros.created || !plan) return 'local'
      const sent = await pushDays(plan, changes.map((c) => c.date), 'les séances ajustées')
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

  const result = analyse.data
  const chosen = result?.changes.filter((_, i) => selected.has(i)) ?? []

  return (
    <div className="space-y-4 pb-4">
      <header className="flex items-center gap-2 pt-4">
        <Link to="/plan" aria-label="Retour" className="-ml-2 p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Ajuster ma semaine</h1>
      </header>

      {!result && !analyse.isPending && (
        <Card>
          <CardDescription>
            Claude lit ta récupération, ta HRV, ton sommeil, ta FC de repos et tes activités des 7 derniers jours, puis propose des
            changements pour le reste de la semaine. Rien n’est modifié sans ton accord.
          </CardDescription>
          <Button className="mt-4 w-full" onClick={() => analyse.mutate()}>
            <Wand2 className="size-5" /> Analyser ma semaine
          </Button>
          {analyse.error && <p className="mt-3 text-sm text-destructive whitespace-pre-line">{claudeErrorMessage(analyse.error)}</p>}
        </Card>
      )}

      {analyse.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {result && (
        <>
          <Card>
            <p className="font-semibold">Bilan</p>
            <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>
          </Card>

          {result.changes.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">Aucun changement nécessaire. Continue comme prévu.</p>
          ) : (
            result.changes.map((c, i) => (
              <ChangeCard
                key={i}
                change={c}
                checked={selected.has(i)}
                onToggle={() =>
                  setSelected((s) => {
                    const n = new Set(s)
                    if (n.has(i)) n.delete(i)
                    else n.add(i)
                    return n
                  })
                }
              />
            ))
          )}

          {result.changes.length > 0 && (
            <Button className="w-full" disabled={chosen.length === 0 || apply.isPending} onClick={() => apply.mutate(chosen)}>
              Appliquer {chosen.length} changement{chosen.length > 1 ? 's' : ''}
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => analyse.reset()}>
            Recommencer
          </Button>
        </>
      )}
    </div>
  )
}

function ChangeCard({ change, checked, onToggle }: { change: Adjustment['changes'][number]; checked: boolean; onToggle: () => void }) {
  const { plan, zones } = usePlan()
  const units = useSettings((s) => s.units)
  const before = allSessions(plan).filter((s) => s.date === change.date && s.type !== 'strength')
  const actionLabel = { replace: 'Modifiée', remove: 'Supprimée', add: 'Ajoutée' }[change.action]

  return (
    <Card className={cn('p-4 transition-opacity', !checked && 'opacity-50')}>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)]" checked={checked} onChange={onToggle} />
        <div className="flex-1">
          <p className="text-xs font-semibold tracking-wide text-accent uppercase">
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
      <p className="text-[11px] font-semibold text-muted-foreground uppercase no-underline">{label}</p>
      {session ? (
        <>
          <div className="mt-1 flex items-center gap-2">
            <TypeBadge type={session.type} />
            <span className="font-semibold">{session.title}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDuration(totals!.seconds)}
            {totals!.meters > 0 && ` · ${formatDistance(totals!.meters, units)}`}
          </p>
        </>
      ) : (
        <p className="mt-1 font-semibold">Repos</p>
      )}
    </div>
  )
}
