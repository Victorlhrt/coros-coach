import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Panel, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { SyncBadge } from '@/components/SyncBadge'
import { addDays, formatDay, today } from '@/lib/coach/dates'
import type { Session, Week } from '@/lib/coach/schema'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { pushDays, syncStatus } from '@/lib/coros/sync'
import { usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'

/**
 * Envoi des séances sur la montre. Seul COROS l'accepte (MCP en écriture) ; Garmin (clé Personal API)
 * et l'archive Strava sont en lecture seule, le bouton n'apparaît donc qu'avec COROS connecté.
 */
function usePush() {
  return useMutation({
    mutationFn: ({ dates, label }: { dates: string[]; label: string }) => pushDays(usePlan.getState().plan!, dates, label),
    onSuccess: (ok) => ok && toast.success('Sent to your watch ✓'),
    onError: toast.error,
  })
}

/** Panneau « Watch » d'une séance : état sur la montre et bouton d'envoi. */
export function SessionWatchPanel({ session }: { session: Session }) {
  const connected = useCorosAuth((s) => s.connected)
  const { plan, coros } = usePlan()
  const push = usePush()
  if (!connected || !plan) return null

  const status = syncStatus(plan, coros.synced, session)
  return (
    <Panel>
      <PanelHeader title="Watch" actions={<SyncBadge status={status} />} />
      {status === 'app-only' ? (
        <PanelSection divided>
          <p className="text-muted-foreground text-sm">COROS doesn’t support strength sessions: follow this one in the app.</p>
        </PanelSection>
      ) : (
        session.date >= today() && (
          <PanelSection divided>
            <Button
              className="w-full"
              onClick={() => push.mutate({ dates: [session.date], label: `the session on ${formatDay(session.date)}` })}
              disabled={push.isPending || status === 'synced'}
            >
              <Send className="size-4" />
              {!coros.created ? 'Send the plan to COROS' : status === 'synced' ? 'Up to date on your watch' : 'Send to COROS'}
            </Button>
          </PanelSection>
        )
      )}
    </Panel>
  )
}

/** Bouton d'envoi d'une semaine (jours passés ignorés) ; rien pour une semaine finie ou sans COROS. */
export function SendWeekButton({ week }: { week: Week }) {
  const connected = useCorosAuth((s) => s.connected)
  const { plan, coros } = usePlan()
  const push = usePush()
  const now = today()
  if (!connected || !plan || week.end < now) return null

  const pending = week.sessions.filter((s) => {
    const st = syncStatus(plan, coros.synced, s)
    return (st === 'not-sent' || st === 'modified') && s.date >= now
  }).length
  const dates: string[] = []
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) dates.push(d)

  return (
    <Button variant="outline" size="sm" onClick={() => push.mutate({ dates, label: `week ${week.number}` })} disabled={push.isPending}>
      <Send className="size-4" />
      {!coros.created ? 'Send plan to COROS' : pending > 0 ? `Send week (${pending} to update)` : 'Resend week'}
    </Button>
  )
}
