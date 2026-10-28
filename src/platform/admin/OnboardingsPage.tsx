import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/arc/badge/badge'
import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { Input } from '@/components/arc/input/input'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { VARIANT_STATUS, formatDateTime, percent } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type VariantRow = {
  id: string
  name: string
  description: string
  status: 'draft' | 'live' | 'archived'
  weight: number
  steps: number
  updated_at: string
  started: number
  completed: number
  signups: number
  plans: number
}

export function OnboardingsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [newId, setNewId] = useState('')
  const variants = useQuery({ queryKey: ['admin', 'onboardings'], queryFn: () => api<VariantRow[]>('/admin/onboardings') })
  const create = useMutation({
    mutationFn: (body: { id: string; from?: string }) => api<{ id: string }>('/admin/onboardings', { body }),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'onboardings'] })
      navigate(`/admin/onboardings/${id}`)
    },
  })

  const rows = variants.data ?? []
  const live = rows.filter((v) => v.status === 'live')
  const totalWeight = live.reduce((s, v) => s + v.weight, 0)

  return (
    <>
      <PageTitle
        title="Onboardings"
        description="Each visitor gets a live flow picked at random according to its weight. Use the preview to test a flow without skewing the numbers."
      />
      <div className="flex flex-col gap-4">
        <ErrorNote error={variants.error ?? create.error} />

        {rows.some((v) => v.started > 0) && (
          <Panel title="Completion rate by flow" description="Completed flows out of started flows, excluding previews.">
            <BarChart
              data={rows.filter((v) => v.status !== 'archived').map((v) => ({ key: v.id, label: v.name, axisLabel: v.name, value: percent(v.completed, v.started) }))}
              label="Completion rate"
              period="since launch"
              unit="%"
              averageLabel="Average"
              valueLabel="Completion"
              categoryLabel="Flow"
            />
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((v) => (
            <Panel
              key={v.id}
              title={v.name}
              description={v.description}
              actions={<Badge tone={VARIANT_STATUS[v.status].tone}>{VARIANT_STATUS[v.status].label}</Badge>}
            >
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Started" value={v.started} />
                <Stat label="Completed" value={`${percent(v.completed, v.started)}%`} />
                <Stat label="Sign-ups" value={v.signups} />
                <Stat label="Plans" value={v.plans} />
              </dl>
              <p className="mt-3 text-muted-foreground text-xs">
                {v.steps} step{v.steps > 1 ? 's' : ''} ·{' '}
                {v.status === 'live' ? `${percent(v.weight, totalWeight)}% of traffic (weight ${v.weight})` : 'no traffic'} · updated {formatDateTime(v.updated_at)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to={`/admin/onboardings/${v.id}`}>Open</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/onboarding?variant=${v.id}&preview=1`} target="_blank" rel="noreferrer">
                    <EyeIcon /> Test
                  </a>
                </Button>
                <Button size="sm" variant="ghost" disabled={create.isPending} onClick={() => create.mutate({ id: `${v.id}-b`, from: v.id })}>
                  Duplicate
                </Button>
              </div>
            </Panel>
          ))}
        </div>

        <Panel title="New flow" description="ID in lowercase letters, digits and hyphens: it appears in the test URL.">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (newId) create.mutate({ id: newId })
            }}
          >
            <div className="w-full sm:w-72">
              <Input label="ID" placeholder="e.g. time-goal" value={newId} onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
            </div>
            <Button type="submit" disabled={!newId || create.isPending}>
              <PlusIcon /> Create
            </Button>
          </form>
        </Panel>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium text-lg tabular-nums">{value}</dd>
    </div>
  )
}
