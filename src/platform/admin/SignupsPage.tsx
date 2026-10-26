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
  created_at: string
  last_login_at: string | null
}

const FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'waitlist', label: 'Liste d’attente' },
  { value: 'active', label: 'Actifs' },
  { value: 'suspended', label: 'Suspendus' },
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
    mutationFn: ({ id, ...patch }: { id: string; status?: UserStatus; role?: UserRole }) => api(`/admin/users/${id}`, { method: 'PATCH', body: patch }),
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
      label: 'Coureur',
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
    { key: 'status', label: 'Statut', sortable: true, render: (_, u) => <Badge tone={USER_STATUS[u.status].tone}>{USER_STATUS[u.status].label}</Badge> },
    { key: 'source', label: 'Source', sortable: true },
    { key: 'onboarding_variant', label: 'Parcours', sortable: true, render: (v) => (v as string | null) ?? '—' },
    { key: 'plans', label: 'Plans', sortable: true, numeric: true },
    { key: 'created_at', label: 'Inscription', sortable: true, render: (v) => formatDateTime(v as string) },
    { key: 'last_login_at', label: 'Dernière connexion', sortable: true, render: (v) => formatDateTime(v as string | null) },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, u) =>
        u.id === me.data?.id ? (
          <span className="text-muted-foreground text-xs">toi</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {u.status !== 'active' && (
              <Button size="xs" onClick={() => update.mutate({ id: u.id, status: 'active' })}>
                {u.status === 'waitlist' ? 'Valider' : 'Réactiver'}
              </Button>
            )}
            {u.status === 'active' && (
              <Button size="xs" variant="outline" onClick={() => update.mutate({ id: u.id, status: 'suspended' })}>
                Suspendre
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => update.mutate({ id: u.id, role: u.role === 'admin' ? 'runner' : 'admin' })}>
              {u.role === 'admin' ? 'Retirer admin' : 'Rendre admin'}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (window.confirm(`Supprimer définitivement le compte ${u.email} et ses plans ?`)) remove.mutate(u.id)
              }}
            >
              Supprimer
            </Button>
          </div>
        ),
    },
  ]

  return (
    <>
      <PageTitle
        title="Inscriptions"
        description="Valide la liste d’attente, suspends ou supprime un compte, donne les droits d’administration."
        actions={
          <Button asChild size="sm" variant="outline">
            <a href="/api/platform/admin/export/users.csv" download>
              <DownloadIcon /> Exporter en CSV
            </a>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Filtrer par statut" options={FILTERS} value={status} onValueChange={(v) => setParams(v === 'all' ? {} : { status: v })} />
        <div className="w-full sm:w-72">
          <SearchField label="Rechercher" placeholder="Nom ou e-mail" value={query} onValueChange={setQuery} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ErrorNote error={users.error ?? update.error ?? remove.error} />
        <SortableDataTable
          rows={rows}
          columns={columns}
          rowKey="id"
          caption="Comptes inscrits"
          emptyMessage={users.isPending ? 'Chargement…' : 'Aucun compte'}
          defaultSort={{ key: 'created_at', direction: 'desc' }}
          itemName={{ one: 'compte', other: 'comptes' }}
        />
      </div>
    </>
  )
}
