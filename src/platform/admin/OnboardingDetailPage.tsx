import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, EyeIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Input } from '@/components/arc/input/input'
import { NumberField } from '@/components/arc/number-field/number-field'
import { Progress } from '@/components/arc/progress/progress'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Textarea } from '@/components/arc/textarea/textarea'
import { Button } from '@/components/shadcn/button'
import { api, type Variant } from '../api'
import { formatDateTime, percent } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type Detail = {
  variant: Variant
  reached: { step: number; n: number }[]
  totals: { started: number; completed: number }
  sessions: { id: string; step_reached: number; completed_at: string | null; created_at: string; is_preview: boolean; answers: Record<string, unknown>; email: string | null }[]
}
type SessionRow = Detail['sessions'][number]

const STATUSES = [
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
]

export function OnboardingDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const detail = useQuery({ queryKey: ['admin', 'onboarding', id], queryFn: () => api<Detail>(`/admin/onboardings/${id}`) })

  const [form, setForm] = useState<{ name: string; description: string; status: Variant['status']; weight: number; steps: string } | null>(null)
  useEffect(() => {
    const v = detail.data?.variant
    if (v) setForm({ name: v.name, description: v.description, status: v.status, weight: v.weight, steps: JSON.stringify(v.steps, null, 2) })
  }, [detail.data])

  const [jsonError, setJsonError] = useState('')
  const save = useMutation({
    mutationFn: () => {
      let steps: unknown
      try {
        steps = JSON.parse(form!.steps)
      } catch {
        setJsonError('The steps are not valid JSON.')
        return Promise.reject(new Error('Invalid JSON'))
      }
      setJsonError('')
      return api(`/admin/onboardings/${id}`, { method: 'PUT', body: { ...form, steps } })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })

  const d = detail.data
  const steps = d?.variant.steps ?? []
  // Entonnoir : parcours ayant atteint au moins l'étape i (step_reached = dernière étape validée).
  const funnel = steps.map((s, i) => ({ step: s, n: (d?.reached ?? []).filter((r) => r.step >= i + 1).reduce((sum, r) => sum + r.n, 0) }))

  const columns: DataColumn<SessionRow>[] = [
    { key: 'created_at', label: 'Started', sortable: true, render: (v) => formatDateTime(v as string) },
    { key: 'email', label: 'Account', render: (v, s) => (s.is_preview ? <span className="text-muted-foreground">preview</span> : ((v as string | null) ?? 'anonymous')) },
    { key: 'step_reached', label: 'Steps', sortable: true, numeric: true, render: (v) => `${v as number}/${steps.length}` },
    { key: 'completed_at', label: 'Completed', sortable: true, render: (v) => formatDateTime(v as string | null) },
    {
      key: 'answers',
      label: 'Answers',
      render: (v) => (
        <code className="block max-w-md truncate text-xs" title={JSON.stringify(v)}>
          {Object.entries(v as Record<string, unknown>)
            .map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(',') : String(x)}`)
            .join(' · ') || '—'}
        </code>
      ),
    },
  ]

  return (
    <>
      <PageTitle
        title={d ? `Flow “${d.variant.name}”` : 'Flow'}
        description={id}
        actions={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link to="/admin/onboardings">
                <ArrowLeftIcon /> All flows
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/onboarding?variant=${id}&preview=1`} target="_blank" rel="noreferrer">
                <EyeIcon /> Test
              </a>
            </Button>
          </>
        }
      />
      <ErrorNote error={detail.error} />
      {d && form && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Panel title="Funnel" description={`${d.totals.started} started · ${d.totals.completed} completed (${percent(d.totals.completed, d.totals.started)}%), excluding previews.`}>
            <ol className="flex flex-col gap-4">
              {funnel.map(({ step, n }, i) => (
                <li key={step.id}>
                  <Progress value={n} max={Math.max(d.totals.started, 1)} label={`${i + 1}. ${step.title}`} showValue />
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Flow settings">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
            >
              <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="flex flex-wrap items-end gap-4">
                <SegmentedControl label="Status" options={STATUSES} value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Variant['status'] })} />
                <NumberField label="Traffic weight" value={form.weight} min={0} max={100} onValueChange={(w) => setForm({ ...form, weight: w })} locale="en-GB" size="sm" />
              </div>
              <Textarea
                label="Steps (JSON)"
                description="kind: choice, multi, number, date, text, days or coros. field: distance, race_date, level, weekly_km and days feed the plan request."
                className="font-mono text-xs"
                rows={16}
                spellCheck={false}
                value={form.steps}
                error={jsonError || undefined}
                onChange={(e) => setForm({ ...form, steps: e.target.value })}
              />
              <ErrorNote error={save.error && !jsonError ? save.error : null} />
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={save.isPending}>
                  Save
                </Button>
                {save.isSuccess && <span className="text-muted-foreground text-sm">Saved.</span>}
              </div>
            </form>
          </Panel>

          <Panel title="Recent sessions" className="xl:col-span-2">
            <SortableDataTable
              rows={d.sessions}
              columns={columns}
              rowKey="id"
              caption="Recent sessions"
              emptyMessage="No sessions yet"
              itemName={{ one: 'session', other: 'sessions' }}
            />
          </Panel>
        </div>
      )}
    </>
  )
}
