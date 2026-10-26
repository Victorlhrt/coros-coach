import { useQuery } from '@tanstack/react-query'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle } from './ui'

type Entry = { id: string; action: string; target: string | null; details: Record<string, unknown>; created_at: string; actor: string | null }

const ACTIONS: Record<string, string> = {
  'user.signup': 'Inscription',
  'user.update': 'Compte modifié',
  'user.delete': 'Compte supprimé',
  'users.export': 'Export CSV',
  'onboarding.create': 'Parcours créé',
  'onboarding.update': 'Parcours modifié',
  'plan.update': 'Plan modifié',
  'settings.signup_mode': 'Mode d’inscription',
  'user.password_reset': 'Mot de passe réinitialisé',
}

const columns: DataColumn<Entry>[] = [
  { key: 'created_at', label: 'Date', sortable: true, render: (v) => formatDateTime(v as string) },
  { key: 'action', label: 'Action', sortable: true, render: (v) => ACTIONS[v as string] ?? (v as string) },
  { key: 'target', label: 'Cible', sortable: true, render: (v) => (v as string | null) ?? '—' },
  { key: 'actor', label: 'Par', sortable: true, render: (v) => (v as string | null) ?? 'système' },
  {
    key: 'details',
    label: 'Détails',
    render: (v) => (
      <code className="block max-w-sm truncate text-xs">
        {Object.entries(v as Record<string, unknown>)
          .map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`)
          .join(' · ')}
      </code>
    ),
  },
]

/** Journal des actions : inscriptions et toutes les écritures du back office (200 dernières). */
export function AuditPage() {
  const entries = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api<Entry[]>('/admin/audit') })
  return (
    <>
      <PageTitle title="Journal" description="Les 200 dernières actions : inscriptions et modifications faites dans le back office." />
      <ErrorNote error={entries.error} />
      <SortableDataTable
        rows={entries.data ?? []}
        columns={columns}
        rowKey="id"
        caption="Journal des actions"
        emptyMessage={entries.isPending ? 'Chargement…' : 'Rien pour l’instant'}
        defaultSort={{ key: 'created_at', direction: 'desc' }}
        itemName={{ one: 'action', other: 'actions' }}
      />
    </>
  )
}
