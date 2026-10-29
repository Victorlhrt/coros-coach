import { useQuery } from '@tanstack/react-query'
import { DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Badge } from '@/components/arc/badge/badge'
import { SearchField } from '@/components/arc/search-field/search-field'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle } from './ui'

type LeadRow = {
  id: string
  email: string
  first_name: string
  last_name: string
  city: string | null
  source: string
  invite_code: string | null
  step_reached: number
  last_step: string | null
  completed_at: string | null
  photo_url: string | null
  signed_up: boolean
  web_results: number
  reminder_sent_at: string | null
  unsubscribed_at: string | null
  created_at: string
  updated_at: string
}

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** Leads : prénom, nom et e-mail captés à la première étape de l'onboarding, inscrits ou non. */
export function LeadsPage() {
  const [query, setQuery] = useState('')
  const leads = useQuery({ queryKey: ['admin', 'leads'], queryFn: () => api<LeadRow[]>('/admin/leads') })

  const q = query.trim().toLowerCase()
  const rows = (leads.data ?? []).filter(
    (l) => !q || l.email.includes(q) || `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) || (l.city ?? '').toLowerCase().includes(q),
  )

  const columns: DataColumn<LeadRow>[] = [
    {
      key: 'last_name',
      label: 'Lead',
      sortable: true,
      render: (_, l) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={`${l.first_name} ${l.last_name}`} src={l.photo_url ?? undefined} size="sm" />
          <div className="min-w-0">
            <div className="font-medium">
              {l.first_name} {l.last_name}
            </div>
            <div className="truncate text-muted-foreground text-xs">{l.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'city', label: 'City', sortable: true, render: (v) => (v as string | null) ?? '—' },
    { key: 'source', label: 'Source', sortable: true, render: (_, l) => (l.invite_code ? `${l.source} · ${l.invite_code}` : l.source) },
    {
      key: 'last_step',
      label: 'Progress',
      sortable: true,
      render: (_, l) =>
        l.completed_at ? <Badge tone="success">Completed</Badge> : <span className="text-sm">{l.last_step ?? '—'} · step {l.step_reached}</span>,
    },
    {
      key: 'reminder_sent_at',
      label: 'Reminder',
      sortable: true,
      render: (_, l) => (
        <div className="flex flex-wrap gap-1">
          {l.reminder_sent_at ? <Badge tone="info" size="sm">Reminded {shortDate.format(new Date(l.reminder_sent_at))}</Badge> : <span className="text-muted-foreground text-sm">—</span>}
          {l.unsubscribed_at && <Badge tone="warning" size="sm">Unsubscribed</Badge>}
        </div>
      ),
    },
    { key: 'signed_up', label: 'Account', sortable: true, render: (v) => (v ? <Badge tone="success">Signed up</Badge> : <Badge>Lead</Badge>) },
    { key: 'web_results', label: 'Online results', sortable: true, numeric: true },
    { key: 'created_at', label: 'Captured', sortable: true, render: (v) => formatDateTime(v as string) },
    { key: 'updated_at', label: 'Last activity', sortable: true, render: (v) => formatDateTime(v as string) },
  ]

  return (
    <>
      <PageTitle
        title="Leads"
        description="Everyone who entered their name and email at the start of the onboarding, signed up or not."
        actions={
          <Button asChild size="sm" variant="outline">
            <a href="/api/platform/admin/export/leads.csv" download>
              <DownloadIcon /> Export CSV
            </a>
          </Button>
        }
      />
      <div className="mb-4 flex justify-end">
        <div className="w-full sm:w-72">
          <SearchField label="Search" placeholder="Name, email or city" value={query} onValueChange={setQuery} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ErrorNote error={leads.error} />
        <SortableDataTable
          rows={rows}
          columns={columns}
          rowKey="id"
          caption="Leads"
          emptyMessage={leads.isPending ? 'Loading…' : 'No leads yet'}
          defaultSort={{ key: 'created_at', direction: 'desc' }}
          itemName={{ one: 'lead', other: 'leads' }}
        />
      </div>
    </>
  )
}
