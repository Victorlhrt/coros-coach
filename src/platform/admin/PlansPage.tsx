import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/arc/badge/badge'
import { DonutChart } from '@/components/arc/donut-chart/donut-chart'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { api } from '../api'
import { DISTANCE_LABELS, LEVEL_LABELS, PLAN_STATUS, formatDate, formatDateTime } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type PlanRow = {
  id: string
  title: string
  goal_distance: string
  goal_date: string | null
  level: string | null
  weeks: number | null
  sessions_per_week: number | null
  status: string
  created_at: string
  email: string
  name: string
  variant_id: string | null
}

const FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'requested', label: 'Demandés' },
  { value: 'active', label: 'Actifs' },
  { value: 'failed', label: 'Échecs' },
]

export function PlansPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const plans = useQuery({ queryKey: ['admin', 'plans', status], queryFn: () => api<PlanRow[]>(`/admin/plans${status === 'all' ? '' : `?status=${status}`}`) })
  const rows = plans.data ?? []

  const byDistance = Object.entries(
    rows.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.goal_distance]: (acc[p.goal_distance] ?? 0) + 1 }), {}),
  ).map(([key, value]) => ({ key, label: DISTANCE_LABELS[key] ?? key, value }))

  const columns: DataColumn<PlanRow>[] = [
    {
      key: 'title',
      label: 'Plan',
      sortable: true,
      render: (_, p) => (
        <Link to={`/admin/plans/${p.id}`} className="font-medium hover:underline">
          {p.title}
        </Link>
      ),
    },
    {
      key: 'name',
      label: 'Coureur',
      sortable: true,
      render: (_, p) => (
        <div className="min-w-0">
          <div>{p.name}</div>
          <div className="truncate text-muted-foreground text-xs">{p.email}</div>
        </div>
      ),
    },
    { key: 'level', label: 'Niveau', sortable: true, render: (v) => (v ? (LEVEL_LABELS[v as string] ?? (v as string)) : '—') },
    { key: 'goal_date', label: 'Course', sortable: true, render: (v) => formatDate(v as string | null) },
    { key: 'weeks', label: 'Semaines', sortable: true, numeric: true, render: (v) => (v as number | null) ?? '—' },
    { key: 'variant_id', label: 'Parcours', sortable: true, render: (v) => (v as string | null) ?? '—' },
    { key: 'status', label: 'Statut', sortable: true, render: (v) => <Badge tone={PLAN_STATUS[v as string]?.tone ?? 'neutral'}>{PLAN_STATUS[v as string]?.label ?? (v as string)}</Badge> },
    { key: 'created_at', label: 'Créé', sortable: true, render: (v) => formatDateTime(v as string) },
  ]

  return (
    <>
      <PageTitle title="Plans" description="Les plans demandés à la fin des onboardings, puis générés par le coach IA." />
      <div className="flex flex-col gap-4">
        <ErrorNote error={plans.error} />
        {byDistance.length > 0 && (
          <Panel title="Répartition par distance">
            <DonutChart data={byDistance} label="Plans par distance" unit="plans" totalLabel="Plans" otherLabel="Autres" emptyLabel="Pas encore de plan" />
          </Panel>
        )}
        <SegmentedControl label="Filtrer par statut" options={FILTERS} value={status} onValueChange={(v) => setParams(v === 'all' ? {} : { status: v })} />
        <SortableDataTable
          rows={rows}
          columns={columns}
          rowKey="id"
          caption="Plans"
          emptyMessage={plans.isPending ? 'Chargement…' : 'Aucun plan'}
          defaultSort={{ key: 'created_at', direction: 'desc' }}
          itemName={{ one: 'plan', other: 'plans' }}
        />
      </div>
    </>
  )
}
