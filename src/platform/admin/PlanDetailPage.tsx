import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { JsonViewer } from '@/components/arc/json-viewer/json-viewer'
import { Select } from '@/components/arc/select/select'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { DISTANCE_LABELS, LEVEL_LABELS, PLAN_STATUS, formatDate, formatDateTime } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type Plan = {
  id: string
  title: string
  goal_distance: string
  goal_date: string | null
  level: string | null
  weeks: number | null
  sessions_per_week: number | null
  status: string
  model: string | null
  data: unknown
  created_at: string
  updated_at: string
  email: string
  name: string
  variant_id: string | null
}

export function PlanDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const plan = useQuery({ queryKey: ['admin', 'plan', id], queryFn: () => api<Plan>(`/admin/plans/${id}`) })
  const setStatus = useMutation({
    mutationFn: (status: string) => api(`/admin/plans/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
  const p = plan.data

  return (
    <>
      <PageTitle
        title={p?.title ?? 'Plan'}
        description={p ? `${p.name} · ${p.email}` : undefined}
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link to="/admin/plans">
              <ArrowLeftIcon /> Tous les plans
            </Link>
          </Button>
        }
      />
      <ErrorNote error={plan.error ?? setStatus.error} />
      {p && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Panel title="Objectif">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Item label="Distance" value={DISTANCE_LABELS[p.goal_distance] ?? p.goal_distance} />
              <Item label="Course" value={formatDate(p.goal_date)} />
              <Item label="Niveau" value={p.level ? (LEVEL_LABELS[p.level] ?? p.level) : '—'} />
              <Item label="Semaines" value={p.weeks ?? '—'} />
              <Item label="Jours / semaine" value={p.sessions_per_week ?? '—'} />
              <Item label="Parcours" value={p.variant_id ?? '—'} />
              <Item label="Modèle" value={p.model ?? '—'} />
              <Item label="Créé" value={formatDateTime(p.created_at)} />
            </dl>
            <div className="mt-5">
              <Select
                label="Statut"
                value={p.status}
                onValueChange={(v) => setStatus.mutate(v)}
                options={Object.entries(PLAN_STATUS).map(([value, s]) => ({ value, label: s.label }))}
              />
            </div>
          </Panel>
          <Panel title="Données du plan" description="Réponses d’onboarding et, une fois généré, semaines et séances.">
            <JsonViewer data={p.data ?? {}} rootName="plan" defaultExpandDepth={2} searchable copyable maxHeight={560} label="Données du plan" />
          </Panel>
        </div>
      )}
    </>
  )
}

function Item({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
