import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Panel, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { SyncBadge } from '@/components/SyncBadge'
import { formatDay, today } from '@/lib/coach/dates'
import type { Session } from '@/lib/coach/schema'
import { useCorosAccountConnected } from '@/lib/coros/account'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { pushDays, syncStatus } from '@/lib/coros/sync'
import { usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'

/**
 * Envoi des séances sur la montre. Seul COROS l'accepte (MCP en écriture) ; Garmin (clé Personal API)
 * et l'archive Strava sont en lecture seule, le bouton n'apparaît donc qu'avec COROS connecté (navigateur ou compte).
 */
function usePush() {
  return useMutation({
    mutationFn: ({ dates, label }: { dates: string[]; label: string }) => pushDays(usePlan.getState().plan!, dates, label),
    onSuccess: (ok) => ok && toast.success('Sent to your watch ✓'),
    onError: toast.error,
  })
}

/** Panneau « Watch » d'une séance à venir : état sur la montre et bouton d'envoi (rien pour une séance passée). */
export function SessionWatchPanel({ session }: { session: Session }) {
  const browser = useCorosAuth((s) => s.connected)
  const account = useCorosAccountConnected()
  const connected = browser || account
  const { plan, coros } = usePlan()
  const push = usePush()
  if (!connected || !plan || session.date < today()) return null

  const status = syncStatus(plan, coros.synced, session)
  return (
    <Panel>
      <PanelHeader
        title="Watch"
        subtitle={<SyncBadge status={status} />}
        actions={
          status !== 'app-only' && (
            <Button
              size="sm"
              onClick={() => push.mutate({ dates: [session.date], label: `the session on ${formatDay(session.date)}` })}
              disabled={push.isPending || status === 'synced'}
            >
              <Send className="size-4" />
              {push.isPending ? 'Sending…' : status === 'synced' ? 'On your watch' : status === 'modified' ? 'Resend to COROS' : 'Send to COROS'}
            </Button>
          )
        }
      />
      {status === 'app-only' && (
        <PanelSection divided>
          <p className="text-muted-foreground text-sm">COROS doesn’t support strength sessions: follow this one in the app.</p>
        </PanelSection>
      )}
    </Panel>
  )
}
