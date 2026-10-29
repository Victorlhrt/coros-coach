import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, CrownIcon, MapPinIcon, RouteIcon, SparklesIcon, TrendingUpIcon, TrophyIcon, UserPlusIcon, UsersIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { CopyButton } from '@/components/arc/copy-button/copy-button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Input } from '@/components/arc/input/input'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { Button as LinkButton } from '@/components/shadcn/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/shadcn/sheet'
import { formatDay, toIso } from '@/lib/coach/dates'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { useActivities } from '@/lib/coros/activity-hooks'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { api } from '../api'
import { formatDuration } from '../onboarding/estimate'

/**
 * Leaderboard : classement de la semaine ou du mois avec ses amis, et onglet City (coureurs de sa ville).
 * Les activités COROS restent lues sur l'appareil ; on pousse au serveur seulement les totaux par jour.
 */

type Period = 'week' | 'month'
type Row = { id: string; name: string; meters: number; seconds: number; runs: number; synced: boolean; rank: number; me: boolean; friend: boolean; paceSecPerKm: number | null; n?: number }
type Board = { period: Period; start: string; end: string; rows: Row[] }
type CityBoard = Board & { city: string | null; runners: number }
type Person = { id: string; name: string; since: string }
type Friends = { friends: Person[]; incoming: Person[]; outgoing: Person[] }

/** Fenêtre lue sur la montre (`useActivities`, 42 jours) : tout jour absent y vaut zéro. */
const SYNC_WINDOW_DAYS = 42
let lastSynced = ''

/**
 * Pousse les totaux quotidiens COROS au serveur dès que les activités sont chargées (une fois par contenu).
 * Monté dans l'espace coureur et sur la page Leaderboard.
 */
export function useRunSync() {
  const { data } = useActivities()
  const qc = useQueryClient()
  useEffect(() => {
    if (!data) return
    const from = toIso(new Date(Date.now() - SYNC_WINDOW_DAYS * 86_400_000))
    const byDay = new Map<string, { date: string; meters: number; seconds: number; runs: number }>()
    for (const a of data.activities) {
      if (a.date < from) continue
      const d = byDay.get(a.date) ?? { date: a.date, meters: 0, seconds: 0, runs: 0 }
      d.meters += Math.max(0, a.meters ?? 0)
      d.seconds += Math.max(0, a.seconds ?? 0)
      d.runs += 1
      byDay.set(a.date, d)
    }
    const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, meters: Math.round(d.meters), seconds: Math.round(d.seconds) }))
    const signature = JSON.stringify([from, days])
    if (signature === lastSynced) return
    lastSynced = signature
    api('/account/runs/daily', { body: { from, days } })
      .then(() => qc.invalidateQueries({ queryKey: ['leaderboard'] }))
      .catch(() => {
        lastSynced = ''
      })
  }, [data, qc])
}

const km = (m: number) => (m / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: m > 0 && m < 100_000 ? 1 : 0 })
const pace = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /km` : '—')
function rangeLabel(b: Pick<Board, 'start' | 'end' | 'period'>) {
  if (b.period === 'month') return formatDay(b.start, { month: 'long', year: 'numeric' })
  return `${formatDay(b.start, { day: 'numeric', month: 'short' })} – ${formatDay(b.end, { day: 'numeric', month: 'short' })}`
}

const PERIODS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function LeaderboardPage() {
  useRunSync()
  const [tab, setTab] = useState('friends')
  const [period, setPeriod] = useState<Period>('week')
  const [adding, setAdding] = useState(false)
  const connected = useCorosAuth((s) => s.connected)

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl">Leaderboard</h1>
          <p className="mt-1 text-muted-foreground text-sm">Your distance this {period}, against your friends and the runners of your city.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Period" options={PERIODS} value={period} onValueChange={(v) => setPeriod(v as Period)} />
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlusIcon className="size-4" /> Add a friend
          </Button>
        </div>
      </div>

      {!connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-dashed px-5 py-4 text-sm">
          <p className="text-muted-foreground">Connect your COROS watch so your runs count in the rankings.</p>
          <LinkButton asChild variant="secondary" size="sm">
            <Link to="/account/settings">Connect COROS</Link>
          </LinkButton>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Leaderboards">
          <TabsTrigger value="friends">Friends</TabsTrigger>
          <TabsTrigger value="city">City</TabsTrigger>
        </TabsList>
        <TabsContent value="friends" className="pt-4">
          <FriendsBoard period={period} onAdd={() => setAdding(true)} />
        </TabsContent>
        <TabsContent value="city" className="pt-4">
          <CityTab period={period} />
        </TabsContent>
      </Tabs>

      <AddFriendSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

// ---------- Amis ----------

function useFriends() {
  return useQuery({ queryKey: ['friends'], queryFn: () => api<Friends>('/account/friends') })
}

function useFriendAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'remove' }) =>
      action === 'accept' ? api(`/account/friends/${id}/accept`, { method: 'POST' }) : api(`/account/friends/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['friends'] })
      void qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
    onError: (e) => toast.error(e),
  })
}

function FriendsBoard({ period, onAdd }: { period: Period; onAdd: () => void }) {
  const board = useQuery({ queryKey: ['leaderboard', 'friends', period], queryFn: () => api<Board>(`/account/leaderboard?period=${period}`) })
  const friends = useFriends()
  const act = useFriendAction()
  const f = friends.data
  const alone = (board.data?.rows.length ?? 0) <= 1

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        {f && f.incoming.length > 0 && (
          <Panel>
            <PanelHeader title="Friend requests" subtitle={String(f.incoming.length)} />
            <ul className="divide-y border-t">
              {f.incoming.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-6 py-3">
                  <Avatar name={p.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: p.id, action: 'remove' })} disabled={act.isPending}>
                    Decline
                  </Button>
                  <Button size="sm" onClick={() => act.mutate({ id: p.id, action: 'accept' })} disabled={act.isPending}>
                    <CheckIcon className="size-4" /> Accept
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Friends ranking" subtitle={board.data ? `${rangeLabel(board.data)} · by distance` : ' '} />
          {board.data ? (
            <>
              <Ranking rows={board.data.rows} />
              {alone && (
                <PanelFooter>
                  <p className="text-muted-foreground text-sm">Add friends to turn your week into a race.</p>
                  <Button size="sm" variant="secondary" onClick={onAdd}>
                    <UserPlusIcon className="size-4" /> Add a friend
                  </Button>
                </PanelFooter>
              )}
            </>
          ) : (
            <RankingSkeleton />
          )}
        </Panel>
      </div>

      <Panel className="self-start">
        <PanelHeader title="Your friends" subtitle={f ? `${f.friends.length} friend${f.friends.length === 1 ? '' : 's'}` : ' '} />
        {f && f.friends.length === 0 && f.outgoing.length === 0 ? (
          <PanelSection divided>
            <EmptyState icon={<UsersIcon width={24} height={24} strokeWidth={1.5} />} title="No friends yet" description="Add a friend with their email or invite code." action={<Button size="sm" onClick={onAdd}>Add a friend</Button>} />
          </PanelSection>
        ) : (
          <ul className="divide-y border-t">
            {f?.friends.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-6 py-3">
                <Avatar name={p.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <button type="button" aria-label={`Remove ${p.name}`} className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground" onClick={() => act.mutate({ id: p.id, action: 'remove' })}>
                  <XIcon className="size-4" />
                </button>
              </li>
            ))}
            {f?.outgoing.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-6 py-3">
                <Avatar name={p.name} size="sm" className="opacity-60" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">{p.name}</span>
                <Badge size="sm">Pending</Badge>
                <button type="button" aria-label={`Cancel request to ${p.name}`} className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground" onClick={() => act.mutate({ id: p.id, action: 'remove' })}>
                  <XIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

// ---------- Classement ----------

const MEDALS = ['#f2c14e', '#c9ced6', '#d0905a']

function Ranking({ rows, gapBefore }: { rows: Row[]; gapBefore?: number }) {
  const top = Math.max(1, ...rows.map((r) => r.meters))
  return (
    <ol className="divide-y border-t">
      {rows.map((r, i) => (
        <li key={r.id} className={cn('relative', r.me && 'bg-foreground/[0.035]', i > 0 && i === gapBefore && 'border-t-2 border-dashed')}>
          <div className="flex items-center gap-3 px-6 py-3.5 sm:gap-4">
            <span className="flex w-7 shrink-0 justify-center font-medium text-sm tabular-nums">
              {r.rank <= 3 && r.meters > 0 ? (
                <span className="flex size-7 items-center justify-center rounded-full text-[13px] text-black" style={{ background: MEDALS[r.rank - 1] }}>
                  {r.rank === 1 ? <CrownIcon className="size-3.5" /> : r.rank}
                </span>
              ) : (
                <span className="text-muted-foreground">{r.rank}</span>
              )}
            </span>
            <Avatar name={r.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm">
                <span className="truncate font-medium">{r.name}</span>
                {r.me && <Badge size="sm" tone="info">You</Badge>}
                {!r.me && r.friend && <Badge size="sm">Friend</Badge>}
              </p>
              <p className="mt-0.5 truncate text-muted-foreground text-xs tabular-nums">
                {!r.synced
                  ? 'Hasn’t synced runs yet'
                  : r.runs === 0
                    ? 'No runs yet'
                    : `${r.runs} run${r.runs > 1 ? 's' : ''} · ${formatDuration(r.seconds)} · ${pace(r.paceSecPerKm)}`}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                <div className={cn('h-full rounded-full', r.me ? 'bg-[var(--accent)]' : 'bg-foreground/40')} style={{ width: `${r.meters > 0 ? Math.max(2, (r.meters / top) * 100) : 0}%` }} />
              </div>
            </div>
            <p className="shrink-0 text-right font-medium text-xl tabular-nums tracking-tight">
              {km(r.meters)}
              <span className="ml-1 text-muted-foreground text-xs">km</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function RankingSkeleton() {
  return (
    <ol className="divide-y border-t" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-4 px-6 py-4">
          <span className="size-7 rounded-full bg-foreground/[0.06]" />
          <span className="size-8 rounded-full bg-foreground/[0.06]" />
          <span className="h-3 flex-1 rounded-full bg-foreground/[0.06]" />
          <span className="h-5 w-14 rounded-full bg-foreground/[0.06]" />
        </li>
      ))}
    </ol>
  )
}

// ---------- Ville ----------

function CityTab({ period }: { period: Period }) {
  const board = useQuery({ queryKey: ['leaderboard', 'city', period], queryFn: () => api<CityBoard>(`/account/leaderboard/city?period=${period}`) })
  const d = board.data

  if (d && !d.city) {
    return (
      <Panel>
        <PanelSection>
          <EmptyState
            icon={<MapPinIcon width={24} height={24} strokeWidth={1.5} />}
            title="Where do you run?"
            description="Tell us the city you run in most and we’ll rank you against the runners there."
            action={
              <LinkButton asChild size="sm">
                <Link to="/onboarding">Add my city</Link>
              </LinkButton>
            }
          />
        </PanelSection>
      </Panel>
    )
  }

  // Le coureur est renvoyé même hors du top 50 : on marque la coupure.
  const rows = d?.rows ?? []
  const cut = rows.findIndex((r, i) => i > 0 && (r.n ?? 0) > (rows[i - 1]!.n ?? 0) + 1)
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel className="self-start">
        <PanelHeader
          title={d ? `Runners in ${d.city}` : 'Your city'}
          subtitle={d ? `${rangeLabel(d)} · ${d.runners} runner${d.runners === 1 ? '' : 's'} ranked` : ' '}
          actions={d && <Badge icon={<MapPinIcon className="size-3" />}>{d.city}</Badge>}
        />
        {d ? (
          <>
            <Ranking rows={rows} gapBefore={cut > 0 ? cut : undefined} />
            <PanelFooter>
              <p className="text-muted-foreground text-xs">Runners outside your friends show as first name and initial.</p>
            </PanelFooter>
          </>
        ) : (
          <RankingSkeleton />
        )}
      </Panel>
      <SegmentsPanel city={d?.city ?? null} />
    </div>
  )
}

/**
 * Segments de la ville (là où on est fort, là où on a progressé) : il faut les traces GPS, que la synchro
 * COROS ne remonte pas encore. On l'explique plutôt que d'afficher des données inventées.
 */
function SegmentsPanel({ city }: { city: string | null }) {
  const cards = [
    { icon: <TrophyIcon className="size-4" />, title: 'Where you’re strong' },
    { icon: <TrendingUpIcon className="size-4" />, title: 'Where you improved' },
  ]
  return (
    <Panel className="self-start">
      <PanelHeader
        title="Segments"
        actions={<Badge tone="info" icon={<SparklesIcon className="size-3" />}>Coming soon</Badge>}
      />
      <PanelSection divided className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.title} className="flex flex-col gap-3 rounded-[20px] border border-dashed p-4">
            <span className="flex items-center gap-2 font-medium text-sm [&>svg]:text-muted-foreground">
              {c.icon}
              {c.title}
            </span>
            <div className="flex flex-col gap-2" aria-hidden="true">
              {[72, 54, 38].map((w) => (
                <div key={w} className="flex items-center gap-2">
                  <RouteIcon className="size-3.5 shrink-0 text-foreground/20" />
                  <span className="h-2 rounded-full bg-foreground/[0.07]" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </PanelSection>
      <PanelFooter>
        <p className="text-muted-foreground text-sm">Needs GPS tracks from {city ?? 'your city'}.</p>
      </PanelFooter>
    </Panel>
  )
}

// ---------- Ajout d'un ami ----------

const METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'code', label: 'Invite code' },
]

function AddFriendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [method, setMethod] = useState<'email' | 'code'>('email')
  const [value, setValue] = useState('')
  const invite = useQuery({ queryKey: ['account', 'invite'], queryFn: () => api<{ code: string }>('/account/invite'), enabled: open })
  const add = useMutation({
    mutationFn: () => api<{ status: 'pending' | 'accepted'; name: string }>('/account/friends', { body: method === 'email' ? { email: value.trim() } : { code: value.trim() } }),
    onSuccess: (r) => {
      toast.success(r.status === 'accepted' ? `You and ${r.name} are now friends.` : `Request sent to ${r.name}.`)
      void qc.invalidateQueries({ queryKey: ['friends'] })
      void qc.invalidateQueries({ queryKey: ['leaderboard'] })
      setValue('')
      onClose()
    },
  })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-6">
          <SheetTitle>Add a friend</SheetTitle>
          <SheetDescription>They’ll get a request; once accepted you’ll see each other in the rankings.</SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) add.mutate()
          }}
        >
          <SegmentedControl
            label="Find by"
            options={METHODS}
            value={method}
            onValueChange={(v) => {
              setMethod(v as 'email' | 'code')
              add.reset()
            }}
          />
          {method === 'email' ? (
            <Input label="Their email" type="email" autoComplete="off" placeholder="friend@example.com" value={value} onChange={(e) => setValue(e.target.value)} error={add.error?.message} />
          ) : (
            <Input label="Their invite code" autoComplete="off" placeholder="e.g. victor-4kz9" value={value} onChange={(e) => setValue(e.target.value)} error={add.error?.message} />
          )}
          {invite.data && (
            <div className="mt-auto rounded-[20px] border bg-foreground/[0.03] p-4">
              <p className="text-muted-foreground text-xs">Your code, for friends who add you</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="font-mono font-semibold text-xl tracking-wide">{invite.data.code}</p>
                <CopyButton value={invite.data.code} />
              </div>
            </div>
          )}
          <button type="submit" hidden />
        </form>
        <SheetFooter className="border-t p-6">
          <Button className="w-full" onClick={() => add.mutate()} loading={add.isPending} disabled={!value.trim()}>
            Send request
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
