import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { SearchField } from '@/components/arc/search-field/search-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Switch } from '@/components/arc/switch/switch'
import { api } from '../api'
import { formatDateTime } from '../format'
import { ErrorNote, PageTitle } from './ui'

/**
 * Clients : offre de chaque compte (Free, Pro, Expert), état de l'abonnement Stripe et accès anticipé.
 * Un changement d'offre ici est « offert » (statut manual) : rien n'est facturé ni changé dans Stripe.
 */

type PlanId = 'free' | 'pro' | 'expert'
type Customer = {
  id: string
  email: string
  name: string
  role: string
  status: string
  plan: PlanId
  plan_status: string | null
  plan_interval: string | null
  plan_period_end: string | null
  plan_cancel_at_period_end: boolean
  early_access: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
}

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'expert', label: 'Expert' },
]
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'paying', label: 'Paying' },
  { value: 'manual', label: 'Complimentary' },
  { value: 'free', label: 'Free' },
]
const SUB_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  trialing: { label: 'Trial', tone: 'info' },
  past_due: { label: 'Payment due', tone: 'warning' },
  unpaid: { label: 'Unpaid', tone: 'danger' },
  incomplete: { label: 'Incomplete', tone: 'warning' },
  incomplete_expired: { label: 'Expired', tone: 'neutral' },
  canceled: { label: 'Canceled', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'neutral' },
  manual: { label: 'Complimentary', tone: 'info' },
}
/** Abonnement Stripe en cours : le prochain événement Stripe réécrira une offre changée ici. */
const LIVE = new Set(['active', 'trialing', 'past_due'])
const isStripeLive = (c: Customer) => !!c.stripe_subscription_id && !!c.plan_status && LIVE.has(c.plan_status)

export function CustomersPage() {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const customers = useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: () => api<{ customers: Customer[]; enforced: boolean }>('/admin/customers'),
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; plan?: PlanId; earlyAccess?: boolean }) => api(`/admin/customers/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })

  const setPlan = (c: Customer, plan: PlanId) => {
    if (plan === c.plan) return
    if (isStripeLive(c) && !window.confirm(`${c.email} pays through Stripe. This doesn’t change their Stripe subscription, and the next Stripe update will overwrite it. Change anyway?`)) return
    update.mutate({ id: c.id, plan })
  }

  const q = query.trim().toLowerCase()
  const all = customers.data?.customers ?? []
  const rows = all.filter(
    (c) =>
      (!q || c.email.includes(q) || c.name.toLowerCase().includes(q)) &&
      (filter === 'all' ||
        (filter === 'paying' && isStripeLive(c)) ||
        (filter === 'manual' && c.plan_status === 'manual') ||
        (filter === 'free' && c.plan === 'free')),
  )
  const paying = all.filter(isStripeLive).length
  const comp = all.filter((c) => c.plan_status === 'manual').length

  const columns: DataColumn<Customer>[] = [
    {
      key: 'name',
      label: 'Customer',
      sortable: true,
      render: (_, c) => (
        <div className="min-w-0">
          <div className="font-medium">
            {c.name} {c.role === 'admin' && <Badge size="sm">admin</Badge>}
          </div>
          <div className="truncate text-muted-foreground text-xs">{c.email}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      label: 'Plan',
      sortable: true,
      render: (_, c) => <SegmentedControl label={`Plan of ${c.email}`} options={PLANS} value={c.plan} onValueChange={(v) => setPlan(c, v as PlanId)} />,
    },
    {
      key: 'plan_status',
      label: 'Subscription',
      sortable: true,
      render: (_, c) => {
        const s = c.plan_status ? SUB_STATUS[c.plan_status] : null
        return (
          <div className="flex flex-col items-start gap-1">
            {s ? <Badge size="sm" tone={s.tone}>{c.plan_cancel_at_period_end ? 'Canceling' : s.label}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
            {c.plan_interval && <span className="text-muted-foreground text-xs">{c.plan_interval === 'year' ? 'Yearly' : 'Monthly'}</span>}
          </div>
        )
      },
    },
    { key: 'plan_period_end', label: 'Renews / ends', sortable: true, render: (v) => formatDateTime(v as string | null) },
    {
      key: 'early_access',
      label: 'Early access',
      sortable: true,
      render: (_, c) => (
        <Switch aria-label={`Early access for ${c.email}`} checked={c.early_access} disabled={update.isPending} onCheckedChange={(v) => update.mutate({ id: c.id, earlyAccess: v })} />
      ),
    },
    {
      key: 'stripe_customer_id',
      label: 'Stripe',
      render: (v) =>
        v ? (
          <a href={`https://dashboard.stripe.com/customers/${v as string}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline">
            Open <ExternalLinkIcon className="size-3" />
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    { key: 'created_at', label: 'Signed up', sortable: true, render: (v) => formatDateTime(v as string) },
  ]

  return (
    <>
      <PageTitle
        title="Customers"
        description={`Change anyone’s plan or early access. A plan set here is complimentary: nothing is charged or changed in Stripe.${
          customers.data && !customers.data.enforced ? ' Billing isn’t enforced yet, so everyone has full access for now.' : ''
        }`}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Filter customers"
          options={FILTERS.map((f) => ({ ...f, label: f.value === 'paying' ? `${f.label} · ${paying}` : f.value === 'manual' ? `${f.label} · ${comp}` : f.label }))}
          value={filter}
          onValueChange={setFilter}
        />
        <div className="w-full sm:w-72">
          <SearchField label="Search" placeholder="Name or email" value={query} onValueChange={setQuery} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ErrorNote error={customers.error ?? update.error} />
        <SortableDataTable
          rows={rows}
          columns={columns}
          rowKey="id"
          caption="Customers and plans"
          emptyMessage={customers.isPending ? 'Loading…' : 'No customers'}
          defaultSort={{ key: 'created_at', direction: 'desc' }}
          itemName={{ one: 'customer', other: 'customers' }}
        />
      </div>
    </>
  )
}
