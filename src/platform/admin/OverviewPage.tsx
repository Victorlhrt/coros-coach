import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/arc/metric-card/metric-card'
import { Streamgraph, type StreamgraphDatum, type StreamgraphSeries } from '@/components/arc/streamgraph/streamgraph'
import { Treemap, type TreemapNode } from '@/components/arc/treemap/treemap'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { DISTANCE_LABELS, LEVEL_LABELS, percent } from '../format'
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
const weekFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** Évolution sur 30 jours par rapport aux 30 précédents. */
function trend(current: number, previous: number) {
  if (!previous) return current ? 'nouveau' : undefined
  const delta = Math.round(((current - previous) / previous) * 100)
  return `${delta >= 0 ? '+' : ''}${delta} %`
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
  if (totals.size > top.length) series.push({ key: 'autres', label: 'Autres' })

  const data: StreamgraphDatum[] = lastMondays(12).map((monday, i) => {
    const week = isoDay(monday)
    const values: Record<string, number> = {}
    for (const r of rows.filter((r) => r.week === week)) values[keyOf(r.source)] = (values[keyOf(r.source)] ?? 0) + r.n
    return { key: week, label: `Semaine du ${weekFmt.format(monday)}`, axisLabel: i % 3 === 0 || i === 11 ? weekFmt.format(monday) : undefined, values }
  })
  return { series, data }
}

function plansTree(rows: Overview['plansByGoal']): TreemapNode {
  const byDistance = new Map<string, TreemapNode>()
  for (const r of rows) {
    const node = byDistance.get(r.distance) ?? { id: r.distance, label: DISTANCE_LABELS[r.distance] ?? r.distance, children: [] }
    node.children!.push({ id: `${r.distance}:${r.level ?? 'na'}`, label: r.level ? (LEVEL_LABELS[r.level] ?? r.level) : 'Niveau inconnu', value: r.n })
    byDistance.set(r.distance, node)
  }
  return { id: 'plans', label: 'Tous les plans', children: [...byDistance.values()] }
}

export function OverviewPage() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/admin/overview') })
  const m = q.data?.metrics
  const stream = q.data ? signupStream(q.data.signupsByWeek) : null

  return (
    <>
      <PageTitle title="Vue d’ensemble" description="Inscriptions, onboardings et plans des 30 derniers jours." />
      <ErrorNote error={q.error} />
      {m && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Inscrits" value={m.users} context={`${m.users30} ces 30 derniers jours`} change={trend(m.users30, m.usersPrev30)} />
            <MetricCard label="Actifs sur 7 jours" value={m.active7} context={`${percent(m.active7, m.users)} % des inscrits`} />
            <MetricCard
              label="Onboardings terminés"
              value={percent(m.onboardingCompleted30, m.onboardingStarted30)}
              suffix="%"
              context={`${m.onboardingCompleted30} sur ${m.onboardingStarted30} commencés (30 j)`}
            />
            <MetricCard label="Plans demandés" value={m.plans} context={`${m.plans30} ces 30 derniers jours`} change={trend(m.plans30, m.plansPrev30)} />
          </div>

          {m.waitlist > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-card px-4 py-3 text-sm">
              <span>
                <strong className="font-medium">{m.waitlist}</strong> {m.waitlist > 1 ? 'personnes attendent' : 'personne attend'} sur la liste d’attente.
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/signups?status=waitlist">Valider les inscriptions</Link>
              </Button>
            </div>
          )}

          <Panel title="Inscriptions par semaine" description="Douze dernières semaines, par source d’acquisition (paramètre utm_source).">
            {stream && <Streamgraph data={stream.data} series={stream.series} label="Inscriptions par source" unit="inscriptions" categoryLabel="Semaine" emptyLabel="Pas encore d’inscription" height={240} />}
          </Panel>

          <Panel title="Plans par objectif" description="Taille : nombre de plans. Clique sur une distance pour voir les niveaux.">
            <Treemap data={plansTree(q.data?.plansByGoal ?? [])} label="Plans par distance et niveau" formatValue={(v) => `${v} plan${v > 1 ? 's' : ''}`} emptyLabel="Pas encore de plan" height={320} />
          </Panel>
        </div>
      )}
    </>
  )
}
