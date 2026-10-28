import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/arc/metric-card/metric-card'
import { Streamgraph, type StreamgraphDatum, type StreamgraphSeries } from '@/components/arc/streamgraph/streamgraph'
import { Treemap, type TreemapNode } from '@/components/arc/treemap/treemap'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { DISTANCE_LABELS, LEVEL_LABELS, percent } from '../format'
import { AiUsagePanel } from './AiUsagePanel'
import { ErrorNote, PageTitle, Panel } from './ui'

type Overview = {
  metrics: {
    users: number
    users30: number
    usersPrev30: number
    active7: number
    waitlist: number
    onboardingStarted30: number
    onboardingCompleted30: number
    plans: number
    plans30: number
    plansPrev30: number
  }
  signupsByWeek: { week: string; source: string; n: number }[]
  plansByGoal: { distance: string; level: string | null; n: number }[]
}

const SOURCE_LABELS: Record<string, string> = { direct: 'Direct', instagram: 'Instagram', strava: 'Strava', google: 'Google', newsletter: 'Newsletter' }
const weekFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** Évolution sur 30 jours par rapport aux 30 précédents. */
function trend(current: number, previous: number) {
  if (!previous) return current ? 'new' : undefined
  const delta = Math.round(((current - previous) / previous) * 100)
  return `${delta >= 0 ? '+' : ''}${delta}%`
}

/** Les douze derniers lundis, y compris les semaines sans inscription. */
function lastMondays(count: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(d)
    m.setDate(d.getDate() - 7 * (count - 1 - i))
    return m
  })
}
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function signupStream(rows: Overview['signupsByWeek']) {
  // Les quatre sources principales, le reste regroupé.
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.source, (totals.get(r.source) ?? 0) + r.n)
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s]) => s)
  const keyOf = (source: string) => (top.includes(source) ? source : 'autres')
  const series: StreamgraphSeries[] = top.map((s) => ({ key: s, label: SOURCE_LABELS[s] ?? s }))
  if (totals.size > top.length) series.push({ key: 'autres', label: 'Other' })

  const data: StreamgraphDatum[] = lastMondays(12).map((monday, i) => {
    const week = isoDay(monday)
    const values: Record<string, number> = {}
    for (const r of rows.filter((r) => r.week === week)) values[keyOf(r.source)] = (values[keyOf(r.source)] ?? 0) + r.n
    return { key: week, label: `Week of ${weekFmt.format(monday)}`, axisLabel: i % 3 === 0 || i === 11 ? weekFmt.format(monday) : undefined, values }
  })
  return { series, data }
}

function plansTree(rows: Overview['plansByGoal']): TreemapNode {
  const byDistance = new Map<string, TreemapNode>()
  for (const r of rows) {
    const node = byDistance.get(r.distance) ?? { id: r.distance, label: DISTANCE_LABELS[r.distance] ?? r.distance, children: [] }
    node.children!.push({ id: `${r.distance}:${r.level ?? 'na'}`, label: r.level ? (LEVEL_LABELS[r.level] ?? r.level) : 'Unknown level', value: r.n })
    byDistance.set(r.distance, node)
  }
  return { id: 'plans', label: 'All plans', children: [...byDistance.values()] }
}

export function OverviewPage() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/admin/overview') })
  const m = q.data?.metrics
  const stream = q.data ? signupStream(q.data.signupsByWeek) : null

  return (
    <>
      <PageTitle title="Overview" description="Signups, onboardings, plans and AI spend over the last 30 days." />
      <ErrorNote error={q.error} />
      {m && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Signups" value={m.users} context={`${m.users30} in the last 30 days`} change={trend(m.users30, m.usersPrev30)} />
            <MetricCard label="Active, last 7 days" value={m.active7} context={`${percent(m.active7, m.users)}% of signups`} />
            <MetricCard
              label="Onboardings completed"
              value={percent(m.onboardingCompleted30, m.onboardingStarted30)}
              suffix="%"
              context={`${m.onboardingCompleted30} of ${m.onboardingStarted30} started (30 days)`}
            />
            <MetricCard label="Plans requested" value={m.plans} context={`${m.plans30} in the last 30 days`} change={trend(m.plans30, m.plansPrev30)} />
          </div>

          <AiUsagePanel />

          {m.waitlist > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-card px-4 py-3 text-sm">
              <span>
                <strong className="font-medium">{m.waitlist}</strong> {m.waitlist > 1 ? 'people are' : 'person is'} on the waitlist.
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/signups?status=waitlist">Review signups</Link>
              </Button>
            </div>
          )}

          <Panel title="Signups per week" description="Last twelve weeks, by acquisition source (utm_source).">
            {stream && <Streamgraph data={stream.data} series={stream.series} label="Signups by source" unit="signups" categoryLabel="Week" emptyLabel="No signups yet" height={240} />}
          </Panel>

          <Panel title="Plans by goal" description="Size: number of plans. Click a distance to see levels.">
            <Treemap data={plansTree(q.data?.plansByGoal ?? [])} label="Plans by distance and level" formatValue={(v) => `${v} plan${v > 1 ? 's' : ''}`} emptyLabel="No plans yet" height={320} />
          </Panel>
        </div>
      )}
    </>
  )
}
