import { useQuery } from '@tanstack/react-query'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle } from './ui'

type Entry = { id: string; action: string; target: string | null; details: Record<string, unknown>; created_at: string; actor: string | null }

const ACTIONS: Record<string, string> = {
  'user.signup': 'Sign-up',
  'user.update': 'Account updated',
  'user.delete': 'Account deleted',
  'users.export': 'CSV export',
  'onboarding.create': 'Flow created',
  'onboarding.update': 'Flow updated',
  'plan.update': 'Plan updated',
  'settings.signup_mode': 'Sign-up mode',
  'user.password_reset': 'Password reset',
  'invite.create': 'Code created',
  'invite.update': 'Code updated',
  'waitlist.invite': 'Invite sent',
}

const columns: DataColumn<Entry>[] = [
  { key: 'created_at', label: 'Date', sortable: true, render: (v) => formatDateTime(v as string) },
  { key: 'action', label: 'Action', sortable: true, render: (v) => ACTIONS[v as string] ?? (v as string) },
  { key: 'target', label: 'Target', sortable: true, render: (v) => (v as string | null) ?? '—' },
  { key: 'actor', label: 'By', sortable: true, render: (v) => (v as string | null) ?? 'system' },
  {
    key: 'details',
    label: 'Details',
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
      <PageTitle title="Audit log" description="The last 200 actions: sign-ups and changes made in the back office." />
      <ErrorNote error={entries.error} />
      <SortableDataTable
        rows={entries.data ?? []}
        columns={columns}
        rowKey="id"
        caption="Audit log"
        emptyMessage={entries.isPending ? 'Loading…' : 'Nothing yet'}
        defaultSort={{ key: 'created_at', direction: 'desc' }}
        itemName={{ one: 'action', other: 'actions' }}
      />
    </>
  )
}
