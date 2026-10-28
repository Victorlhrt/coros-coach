import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type Settings = { signupMode: 'open' | 'waitlist' | 'closed'; admins: { id: string; email: string; name: string; last_login_at: string | null }[] }

const MODES = [
  { value: 'open', label: 'Open', description: 'Every sign-up creates an active account.' },
  { value: 'waitlist', label: 'Waitlist', description: 'Accounts wait for your approval in Sign-ups.' },
  { value: 'closed', label: 'Closed', description: 'Nobody can sign up anymore (except ADMIN_EMAILS addresses).' },
]

export function SettingsPage() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<Settings>('/admin/settings') })
  const setMode = useMutation({
    mutationFn: (signupMode: string) => api('/admin/settings', { method: 'PUT', body: { signupMode } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  })

  return (
    <>
      <PageTitle title="Access & settings" description="Sign-up availability and the admin team." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ErrorNote error={settings.error ?? setMode.error} />
        <Panel title="Sign-ups">
          {settings.data && (
            <RadioCards aria-label="Sign-up mode" layout="list" options={MODES} value={settings.data.signupMode} onValueChange={(v) => setMode.mutate(v)} />
          )}
        </Panel>
        <Panel title="Admins" description="Grant or revoke admin rights from the Sign-ups page. ADMIN_EMAILS addresses are always admins.">
          <ul className="divide-y">
            {settings.data?.admins.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{a.name}</div>
                  <div className="truncate text-muted-foreground text-xs">{a.email}</div>
                </div>
                <span className="shrink-0 text-muted-foreground text-xs">seen {formatDateTime(a.last_login_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
