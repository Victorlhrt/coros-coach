import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Panel, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button } from '@/components/shadcn/button'
import { SyncBadge } from '@/components/SyncBadge'
import { formatDay, today } from '@/lib/coach/dates'
import { ROUTES } from '@/lib/coach/routes'
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

/**
 * Panneau « Watch » d'une séance : toujours affiché, avec le bouton d'envoi quand c'est possible,
 * sinon la raison (séance passée, renforcement, COROS non connecté).
 */
export function SessionWatchPanel({ session }: { session: Session }) {
  const browser = useCorosAuth((s) => s.connected)
  const account = useCorosAccountConnected()
  const { plan, coros } = usePlan()
  const push = usePush()
  if (!plan) return null

  const status = syncStatus(plan, coros.synced, session)
  const past = session.date < today()
  const connected = browser || account.connected
  const reason =
    status === 'app-only'
      ? 'COROS doesn’t support strength sessions: follow this one in the app.'
      : past
        ? 'This session is in the past: only today’s and upcoming sessions can be sent.'
        : account.loading && !browser
          ? 'Checking your COROS connection…'
          : !connected
            ? 'Connect COROS in Settings to send this session to your watch. Garmin and Strava can’t receive sessions.'
            : null

  return (
    <Panel>
      <PanelHeader
        title="Watch"
        subtitle={<SyncBadge status={status} />}
        actions={
          !reason && (
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
      {reason && (
        <PanelSection divided>
          <p className="text-muted-foreground text-sm">
            {reason}{' '}
            {!connected && !past && status !== 'app-only' && !account.loading && (
              <Link to={ROUTES.settings} className="text-foreground underline underline-offset-4">
                Open Settings
              </Link>
            )}
          </p>
        </PanelSection>
      )}
    </Panel>
  )
}
