import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type Settings = { signupMode: 'open' | 'waitlist' | 'closed'; admins: { id: string; email: string; name: string; last_login_at: string | null }[] }

const MODES = [
  { value: 'open', label: 'Ouvertes', description: 'Chaque inscription crée un compte actif.' },
  { value: 'waitlist', label: 'Liste d’attente', description: 'Les comptes attendent ta validation dans Inscriptions.' },
  { value: 'closed', label: 'Fermées', description: 'Plus personne ne peut s’inscrire (sauf les e-mails ADMIN_EMAILS).' },
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
      <PageTitle title="Accès et réglages" description="Ouverture des inscriptions et équipe d’administration." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ErrorNote error={settings.error ?? setMode.error} />
        <Panel title="Inscriptions">
          {settings.data && (
            <RadioCards aria-label="Mode d’inscription" layout="list" options={MODES} value={settings.data.signupMode} onValueChange={(v) => setMode.mutate(v)} />
          )}
        </Panel>
        <Panel title="Administrateurs" description="Donne ou retire les droits depuis la page Inscriptions. Les e-mails de ADMIN_EMAILS sont toujours administrateurs.">
          <ul className="divide-y">
            {settings.data?.admins.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{a.name}</div>
                  <div className="truncate text-muted-foreground text-xs">{a.email}</div>
                </div>
                <span className="shrink-0 text-muted-foreground text-xs">vu {formatDateTime(a.last_login_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
