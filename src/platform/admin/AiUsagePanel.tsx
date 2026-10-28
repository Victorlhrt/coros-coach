import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { Panel } from './ui'

/**
 * Consommation de l'IA : dépense du mois face au budget (arrêt net au-delà), coût jour par jour
 * sur 30 jours, répartition par modèle et par coureur. Le budget se modifie ici.
 */

type AiUsage = {
  spentEur: number
  capEur: number
  blocked: boolean
  usdToEur: number
  daily: { day: string; eur: number; input: number; output: number; calls: number }[]
  byModel: { model: string; eur: number; calls: number }[]
  byUser: { name: string; email: string | null; eur: number; calls: number }[]
}

const eur = (v: number) => `€${v < 10 ? v.toFixed(2) : v.toFixed(1)}`
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 })

export function AiUsagePanel() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'ai-usage'], queryFn: () => api<AiUsage>('/admin/ai-usage'), refetchInterval: 60_000 })
  const [cap, setCap] = useState('')
  const save = useMutation({
    mutationFn: (capEur: number) => api('/admin/ai-usage/budget', { method: 'PUT', body: { capEur } }),
    onSuccess: () => {
      setCap('')
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-usage'] })
    },
  })
  const d = q.data
  if (!d) return null
  const pct = Math.min(100, (d.spentEur / d.capEur) * 100)
  const color = d.blocked ? 'var(--session-interval)' : pct >= 80 ? 'var(--session-tempo)' : 'var(--session-easy)'
  const month = d.daily.filter((x) => x.day.slice(0, 7) === d.daily.at(-1)?.day.slice(0, 7))
  const tokens = month.reduce((a, x) => a + x.input + x.output, 0)
  const calls = month.reduce((a, x) => a + x.calls, 0)
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projected = (d.spentEur / now.getDate()) * daysInMonth

  return (
    <Panel title="AI usage" description="Claude API spend through the relay. Calls stop automatically once the monthly budget is reached.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-muted-foreground text-xs">This month</p>
              <p className="font-medium text-xs" style={{ color }}>
                {d.blocked ? 'Hard stop active' : `${Math.round(pct)}% of budget`}
              </p>
            </div>
            <p className="mt-1 font-semibold text-3xl tabular-nums tracking-tight">
              {eur(d.spentEur)} <span className="font-normal text-base text-muted-foreground">/ €{d.capEur}</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(1, pct)}%`, background: color }} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Projected</dt>
                <dd className="font-medium tabular-nums" style={projected > d.capEur ? { color: 'var(--session-tempo)' } : undefined}>
                  {eur(projected)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Calls</dt>
                <dd className="font-medium tabular-nums">{calls}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tokens</dt>
                <dd className="font-medium tabular-nums">{compact.format(tokens)}</dd>
              </div>
            </dl>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const v = Number(cap.replace(',', '.'))
              if (v > 0) save.mutate(v)
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Monthly budget (€)</span>
              <input
                inputMode="decimal"
                placeholder={String(d.capEur)}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className="h-9 rounded-lg border bg-background px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <Button type="submit" size="sm" variant="outline" disabled={!cap || save.isPending}>
              Save
            </Button>
          </form>
          {save.error && <p className="text-destructive text-xs">{save.error.message}</p>}
          <p className="text-muted-foreground text-xs">Prices from Anthropic in USD, converted at €{d.usdToEur} per $1. Resets on the 1st of each month.</p>
        </div>

        <div className="min-w-0">
          <BarChart
            data={d.daily.map((x, i) => ({
              key: x.day,
              label: dayFmt.format(new Date(`${x.day}T00:00:00`)),
              axisLabel: i % 5 === 0 || i === d.daily.length - 1 ? dayFmt.format(new Date(`${x.day}T00:00:00`)) : undefined,
              value: Math.round(x.eur * 100) / 100,
            }))}
            label="Daily AI cost"
            period="Last 30 days"
            unit="€"
            averageLabel="Daily average"
            valueLabel="Cost"
            categoryLabel="Day"
            height={240}
            formatValue={(v) => eur(v)}
          />
        </div>
      </div>

      {(d.byModel.length > 0 || d.byUser.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Breakdown title="By model (this month)" rows={d.byModel.map((m) => ({ label: m.model, eur: m.eur, calls: m.calls }))} total={d.spentEur} />
          <Breakdown title="By runner (this month)" rows={d.byUser.map((u) => ({ label: u.name, sub: u.email ?? undefined, eur: u.eur, calls: u.calls }))} total={d.spentEur} />
        </div>
      )}
    </Panel>
  )
}

function Breakdown({ title, rows, total }: { title: string; rows: { label: string; sub?: string; eur: number; calls: number }[]; total: number }) {
  return (
    <div className="rounded-xl border">
      <p className="border-b px-4 py-2.5 font-medium text-xs">{title}</p>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.label + (r.sub ?? '')} className="relative px-4 py-2.5 text-sm">
            <span aria-hidden className="absolute inset-y-0 left-0 bg-foreground/[0.05]" style={{ width: `${total ? (r.eur / total) * 100 : 0}%` }} />
            <span className="relative flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate">{r.label}</span>
                {r.sub && <span className="block truncate text-muted-foreground text-xs">{r.sub}</span>}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block font-medium">{eur(r.eur)}</span>
                <span className="block text-muted-foreground text-xs">{r.calls} call{r.calls > 1 ? "s" : ""}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
