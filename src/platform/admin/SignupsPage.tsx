import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/arc/badge/badge'
import { SearchField } from '@/components/arc/search-field/search-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Button } from '@/components/shadcn/button'
import { api, type UserRole, type UserStatus } from '../api'
import { USER_STATUS, formatDateTime } from '../format'
import { useMe } from '../session'
import { ErrorNote, PageTitle } from './ui'

type UserRow = {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  source: string
  onboarding_variant: string | null
  plans: number
  plan: 'free' | 'pro' | 'expert'
  plan_status: string | null
  plan_interval: string | null
  early_access: boolean
  created_at: string
  last_login_at: string | null
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

export function SignupsPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const [query, setQuery] = useState('')
  const me = useMe()
  const qc = useQueryClient()

  const users = useQuery({
    queryKey: ['admin', 'users', status],
    queryFn: () => api<UserRow[]>(`/admin/users${status === 'all' ? '' : `?status=${status}`}`),
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: UserStatus }) => api(`/admin/users/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })

  const q = query.trim().toLowerCase()
  const rows = (users.data ?? []).filter((u) => !q || u.email.includes(q) || u.name.toLowerCase().includes(q))

  const columns: DataColumn<UserRow>[] = [
    {
      key: 'name',
      label: 'Runner',
      sortable: true,
      render: (_, u) => (
        <div className="min-w-0">
          <div className="font-medium">
            {u.name} {u.role === 'admin' && <Badge size="sm">admin</Badge>}
          </div>
          <div className="truncate text-muted-foreground text-xs">{u.email}</div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', sortable: true, render: (_, u) => <Badge tone={USER_STATUS[u.status].tone}>{USER_STATUS[u.status].label}</Badge> },
    {
      key: 'plan',
      label: 'Plan',
      sortable: true,
      render: (_, u) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge size="sm" tone={u.plan === 'free' ? 'neutral' : u.plan_status === 'past_due' ? 'warning' : 'success'}>
            {`${u.plan === 'free' ? 'Free' : u.plan === 'pro' ? 'Pro' : 'Expert'}${u.plan !== 'free' && u.plan_interval ? ` · ${u.plan_interval === 'year' ? 'yearly' : 'monthly'}` : ''}`}
          </Badge>
          {u.early_access && (
            <Badge size="sm" tone="info">
              early
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'source', label: 'Source', sortable: true },
    { key: 'onboarding_variant', label: 'Flow', sortable: true, render: (v) => (v as string | null) ?? '—' },
    { key: 'plans', label: 'Plans', sortable: true, numeric: true },
    { key: 'created_at', label: 'Signed up', sortable: true, render: (v) => formatDateTime(v as string) },
    { key: 'last_login_at', label: 'Last login', sortable: true, render: (v) => formatDateTime(v as string | null) },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, u) =>
        u.id === me.data?.id ? (
          <span className="text-muted-foreground text-xs">you</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {u.status !== 'active' && (
              <Button size="xs" onClick={() => update.mutate({ id: u.id, status: 'active' })}>
                {u.status === 'waitlist' ? 'Approve' : 'Reactivate'}
              </Button>
            )}
            {u.status === 'active' && (
              <Button size="xs" variant="outline" onClick={() => update.mutate({ id: u.id, status: 'suspended' })}>
                Suspend
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (window.confirm(`Permanently delete the account ${u.email} and its plans?`)) remove.mutate(u.id)
              }}
            >
              Delete
            </Button>
          </div>
        ),
    },
  ]

  return (
    <>
      <PageTitle
        title="Sign-ups"
        description="Approve the waitlist, suspend or delete accounts, grant admin rights."
        actions={
          <Button asChild size="sm" variant="outline">
            <a href="/api/platform/admin/export/users.csv" download>
              <DownloadIcon /> Export CSV
            </a>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Filter by status" options={FILTERS} value={status} onValueChange={(v) => setParams(v === 'all' ? {} : { status: v })} />
        <div className="w-full sm:w-72">
          <SearchField label="Search" placeholder="Name or email" value={query} onValueChange={setQuery} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ErrorNote error={users.error ?? update.error ?? remove.error} />
        <SortableDataTable
          rows={rows}
          columns={columns}
          rowKey="id"
          caption="Registered accounts"
          emptyMessage={users.isPending ? 'Loading…' : 'No accounts'}
          defaultSort={{ key: 'created_at', direction: 'desc' }}
          itemName={{ one: 'account', other: 'accounts' }}
        />
      </div>
    </>
  )
}
