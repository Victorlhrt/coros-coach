import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActivityIcon, HomeIcon, BarChart3Icon, CalendarDaysIcon, FootprintsIcon, LogOutIcon, MessageCircleIcon, PencilIcon, PlusIcon, SettingsIcon, ShieldIcon, TrophyIcon, UserIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { RunnerAvatar } from './RunnerAvatar'
import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Combobox } from '@/components/arc/combobox/combobox'
import { Input } from '@/components/arc/input/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/shadcn/sheet'
import { Countdown } from '@/components/arc/countdown/countdown'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Button as LinkButton } from '@/components/shadcn/button'
import { CustomSidebarTrigger } from '@/components/custom-sidebar-trigger'
import { LogoIcon } from '@/components/logo'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@/components/shadcn/sidebar'
import { cn } from '@/lib/utils'
import { api } from '../api'
import { BRAND } from '../brand'
import type { CompleteAnswers } from '../onboarding/CompleteOnboarding'
import { formatDuration, formatPace } from '../onboarding/estimate'
import { ShareButtons } from '../invite/ShareButtons'
import { useLogout, useMe } from '../session'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { LockScreen } from '@/components/LockScreen'
import { Toaster } from '@/components/Toaster'
import { formatDay, toIso } from '@/lib/coach/dates'
import { useAutoLink } from '@/lib/coach/links'
import { usePlanEnglish } from '@/lib/coach/translate'
import { useWeeklyReview } from '@/lib/coach/review'
import { useCorosCallback } from '@/lib/coros/callback'
import { initVault, setupAutoLock, useVault } from '@/lib/lock/vault'
import { startStateSync } from '@/lib/server/state-sync'
import { usePlan, usePlanRepair } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { DebugPage } from '@/pages/DebugPage'
import { OnboardingPage as GoalPage } from '@/pages/OnboardingPage'
import { PlanPage as CoachPlanPage } from '@/pages/PlanPage'
import { SessionPage } from '@/pages/SessionPage'
import { SettingsPage as CoachSettingsPage } from '@/pages/SettingsPage'
import { AnalyticsDashboards, HomeTab, PlanTab } from './CoachTabs'
import { BrandLogo } from './brands'
import { CoachChat } from './CoachChat'
import { FitnessDashboard } from './Fitness'
import { MobileSubNav, MobileTabBar } from './MobileTabBar'
import { Integrations } from './Integrations'
import { LeaderboardPage, useRunSync } from './Leaderboard'
import { Panel as RPanel, PanelHeader as RPanelHeader } from '@/components/raice/panel'
import { TrackLoader } from '@/components/raice/track-loader'

/**
 * Espace coureur (app.raice.run/account) : barre latérale avec Plan, Analytics, Coach et Equipment,
 * Profile et Settings en bas à gauche ; contenu en pleine largeur sur desktop.
 * Tout part des réponses du dernier onboarding, en attendant la synchronisation des montres.
 */

type Plan = { id: string; title: string; goal_distance: string; goal_date: string | null; level: string | null; weeks: number | null; sessions_per_week: number | null; status: string }
type Overview = { answers: CompleteAnswers | null; completedAt: string | null; plans: Plan[]; shoes?: Shoe[] }

type NavItem = { title: string; path: string; icon: ReactNode; children?: { title: string; path: string }[] }

const NAV: NavItem[] = [
  { title: 'Home', path: '/account/home', icon: <HomeIcon /> },
  { title: 'Plan', path: '/account/plan', icon: <CalendarDaysIcon /> },
  {
    title: 'Analytics',
    path: '/account/analytics',
    icon: <BarChart3Icon />,
    children: [
      { title: 'Runs', path: '/account/analytics/runs' },
      { title: 'Fitness', path: '/account/analytics/fitness' },
    ],
  },
  { title: 'Leaderboard', path: '/account/leaderboard', icon: <TrophyIcon /> },
  { title: 'Coach', path: '/account/coach', icon: <MessageCircleIcon /> },
  { title: 'Equipment', path: '/account/equipment', icon: <FootprintsIcon /> },
]
const FOOTER_NAV: NavItem[] = [
  { title: 'Profile', path: '/account/profile', icon: <UserIcon /> },
  { title: 'Settings', path: '/account/settings', icon: <SettingsIcon /> },
]

const WEEK = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
] as const
const LEVELS: Record<string, string> = { debutant: 'Beginner', intermediaire: 'Intermediate', confirme: 'Advanced' }
const SESSION_MAX: Record<string, string> = { '30': '30 min', '45': '45 min', '60': '1h', '90': '1h30 or more' }
const DISTANCE_LABELS: Record<string, string> = { '5k': '5K', '10k': '10K', half: 'Half marathon', marathon: 'Marathon', trail: 'Trail' }
const PLAN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  requested: { label: 'Requested', tone: 'info' },
  generating: { label: 'Generating', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
}
const formatDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? formatDay(iso.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : iso)
const WATCHES: Record<string, string> = { coros: 'COROS', garmin: 'Garmin', apple: 'Apple Watch', suunto: 'Suunto', polar: 'Polar' }

function useOverview() {
  return useQuery({ queryKey: ['account', 'overview'], queryFn: () => api<Overview>('/account/overview') })
}

// Coffre de l'appareil (tokens COROS) : ouvert ou verrouillé avant le premier rendu du coach.
let vaultReady = false
function prepareVault() {
  if (vaultReady) return
  vaultReady = true
  initVault()
  setupAutoLock(() => useSettings.getState().autoLockMinutes)
}

/** Les données du coach gardées sur l'appareil appartiennent à un compte : on repart de zéro si un autre se connecte. */
const OWNER_KEY = 'coach.owner'
function claimDevice(userId: string) {
  try {
    if (localStorage.getItem(OWNER_KEY) === userId) return
    usePlan.setState(usePlan.getInitialState(), true)
    localStorage.setItem(OWNER_KEY, userId)
  } catch {
    /* sans stockage, rien à protéger */
  }
}

export default function RunnerApp() {
  prepareVault()
  const me = useMe()
  const location = useLocation()
  const locked = useVault((s) => s.status === 'locked')
  const coros = useCorosCallback()
  const [synced, setSynced] = useState(false)
  const active = me.data?.status === 'active'

  // Le coach (plan, séances, ressentis) est synchronisé avec le compte, sur tous les appareils.
  useEffect(() => {
    if (!me.data || !active) return
    claimDevice(me.data.id)
    startStateSync()
      .catch((err) => toast.error(err))
      .finally(() => setSynced(true))
  }, [me.data, active])

  if (me.isPending) return <div className="min-h-dvh" />
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (locked) return <LockScreen />

  return (
    <SidebarProvider>
      <RunnerSidebar />
      <SidebarInset>
        <RunnerHeader />
        {coros.status === 'error' && (
          <div className="mx-4 mt-4 rounded-[18px] border border-destructive/50 p-4 text-sm md:mx-8">
            <p className="font-medium">Couldn’t connect to COROS</p>
            <p className="mt-1 text-muted-foreground">{coros.message}</p>
            <button type="button" className="mt-2 text-sm underline" onClick={coros.dismiss}>
              Close
            </button>
          </div>
        )}
        <div className="flex w-full flex-1 flex-col p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-8">
          {coros.status === 'pending' || (active && !synced) ? (
            <TrackLoader label={coros.status === 'pending' ? 'Connecting to COROS' : 'Loading your plan'} />
          ) : (
            <CoachRoutes />
          )}
        </div>
      </SidebarInset>
      <ConfirmSheet />
      <Toaster />
      <RunnerTabBar />
    </SidebarProvider>
  )
}

function CoachRoutes() {
  useAutoLink()
  usePlanRepair()
  usePlanEnglish()
  useWeeklyReview()
  useRunSync()
  const hasPlan = usePlan((s) => !!s.plan)
  return (
    <Routes>
      <Route index element={<Navigate to="home" replace />} />
      <Route path="home" element={hasPlan ? <HomeTab /> : <OnboardingPlanPage />} />
      <Route path="plan" element={hasPlan ? <PlanTab /> : <CoachPlanPage />} />
      <Route path="analytics" element={<Navigate to="runs" replace />} />
      <Route path="analytics/:view" element={<AnalyticsTab />} />
      <Route path="leaderboard" element={<LeaderboardPage />} />
      <Route path="coach" element={<CoachTab />} />
      <Route path="equipment" element={<EquipmentPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="settings" element={<SettingsTab />} />
      <Route path="session/:id" element={<SessionPage />} />
      <Route path="goal" element={<GoalPage />} />
      <Route path="debug" element={<DebugPage />} />
      <Route path="*" element={<Navigate to="home" replace />} />
    </Routes>
  )
}

/** Analytics en deux sous-menus (barre latérale) : Runs (volume, sorties, journal) et Fitness (VO2max, prédicteurs de course). */
function AnalyticsTab() {
  const { data } = useOverview()
  const { pathname } = useLocation()
  const view = pathname.endsWith('/fitness') ? 'fitness' : 'runs'
  return (
    <div className="flex w-full flex-col gap-4">
      <MobileSubNav items={NAV.find((n) => n.children)?.children ?? []} />
      {view === 'fitness' ? (
        <FitnessDashboard />
      ) : (
        <>
          <AnalyticsDashboards />
          {data?.answers && <OnboardingAnalytics />}
        </>
      )}
    </div>
  )
}

function SettingsTab() {
  const { data } = useOverview()
  return (
    <div className="flex w-full flex-col gap-4">
      <CoachSettingsPage>
        <Integrations stravaRuns={data?.answers?.strava?.runs} />
      </CoachSettingsPage>
      <AccountSettings />
    </div>
  )
}

function RunnerSidebar() {
  const { pathname } = useLocation()
  const me = useMe().data
  const item = (n: NavItem, small?: boolean) => (
    <SidebarMenuItem key={n.path}>
      <SidebarMenuButton asChild isActive={pathname.startsWith(n.path) && !n.children} tooltip={n.title} size={small ? 'sm' : 'default'}>
        <Link to={n.children ? n.children[0].path : n.path}>
          {n.icon}
          <span>{n.title}</span>
        </Link>
      </SidebarMenuButton>
      {n.children && (
        <SidebarMenuSub>
          {n.children.map((c) => (
            <SidebarMenuSubItem key={c.path}>
              <SidebarMenuSubButton asChild isActive={pathname.startsWith(c.path)}>
                <Link to={c.path}>{c.title}</Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        '*:data-[slot=sidebar-inner]:bg-background',
        '*:data-[slot=sidebar-inner]:dark:bg-[radial-gradient(60%_18%_at_10%_0%,--theme(--color-foreground/.08),transparent)]',
      )}
    >
      <SidebarHeader className="h-14 justify-center border-b px-2">
        <SidebarMenuButton asChild>
          <Link to="/account/home">
            <LogoIcon />
            <span className="font-medium">{BRAND.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>{NAV.map((n) => item(n))}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          {me?.role === 'admin' &&
            item({ title: 'Back office', path: '/admin', icon: <ShieldIcon /> }, true)}
          {FOOTER_NAV.map((n) => item(n, true))}
        </SidebarMenu>
        {me && (
          <div className="flex items-center gap-2 px-2 pt-2 group-data-[collapsible=icon]:hidden">
            <RunnerAvatar name={me.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm">{me.name}</p>
              <p className="truncate text-muted-foreground text-xs">{me.email}</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}

/** Mobile : barre d'onglets en bas ; « More » regroupe les pages hors des quatre onglets. */
function RunnerTabBar() {
  const me = useMe().data
  const more = [
    ...NAV.filter((n) => ['Leaderboard', 'Equipment'].includes(n.title)),
    ...FOOTER_NAV,
    ...(me?.role === 'admin' ? [{ title: 'Back office', path: '/admin', icon: <ShieldIcon /> }] : []),
  ]
  return <MobileTabBar more={more} />
}

function RunnerHeader() {
  const { pathname } = useLocation()
  const page = [...NAV, ...FOOTER_NAV].find((n) => pathname.startsWith(n.path))
  const sub = page?.children?.find((c) => pathname.startsWith(c.path))
  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm md:px-8">
      <span className="hidden md:contents">
        <CustomSidebarTrigger />
      </span>
      <span className="flex items-center gap-2 font-medium text-sm [&>svg]:size-4">
        {page?.icon}
        {page?.title}
        {sub && <span className="text-muted-foreground">/ {sub.title}</span>}
      </span>
    </header>
  )
}

function PageTitle({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-2xl">{title}</h1>
        {children && <p className="mt-1 text-muted-foreground text-sm">{children}</p>}
      </div>
      {action}
    </div>
  )
}

function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4 rounded-[24px] border bg-card p-6', className)}>
      {title && <h2 className="font-medium text-sm">{title}</h2>}
      {children}
    </section>
  )
}

function NoOnboarding() {
  return (
    <EmptyState
      title="No plan yet"
      description="Answer Pacer’s questions and we’ll build your plan."
      action={
        <LinkButton asChild>
          <Link to="/onboarding">Create my plan</Link>
        </LinkButton>
      }
    />
  )
}

// ---------- Plan ----------

function OnboardingPlanPage() {
  const { data, isPending } = useOverview()
  if (isPending) return null
  const a = data?.answers
  const plan = data?.plans[0]
  if (!a && !plan) return <NoOnboarding />
  const race = a?.goal?.race
  const date = plan?.goal_date ?? a?.goal?.date ?? null
  const days = a?.schedule?.days ?? []
  const longDay = a?.schedule?.longDay

  return (
    <>
      <PageTitle
        title={race?.name ?? plan?.title ?? 'My plan'}
        action={plan && <Badge tone={PLAN_STATUS[plan.status]?.tone ?? 'neutral'}>{PLAN_STATUS[plan.status]?.label ?? plan.status}</Badge>}
      >
        {[race?.detail ?? (plan && DISTANCE_LABELS[plan.goal_distance]), date && `on ${formatDate(date)}`, plan?.weeks && `${plan.weeks} weeks`].filter(Boolean).join(' · ')}
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-3">
        {date && (
          <Panel title="Race day" className="lg:col-span-2">
            <Countdown target={`${date}T08:00:00`} timeZone="Europe/Paris" units={['days', 'hours']} label="Until the race" completeLabel="It’s race day" />
          </Panel>
        )}
        <Panel title="Goal" className={date ? '' : 'lg:col-span-3'}>
          {a?.estimate?.target ? (
            <div>
              <p className="font-semibold text-4xl tabular-nums tracking-tight">{formatDuration(a.estimate.target)}</p>
              {race && <p className="mt-1 text-muted-foreground text-sm">{formatPace(a.estimate.target, race.km)}</p>}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No target time: we build consistency first.</p>
          )}
        </Panel>
      </div>

      <Panel title="Your typical week" className="mt-4">
        {days.length ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {WEEK.map(([id, label]) => {
              const on = days.includes(id)
              const long = id === longDay
              return (
                <div key={id} className={cn('flex min-h-24 flex-col justify-between rounded-[16px] border p-3', on ? 'bg-background' : 'border-dashed opacity-50')}>
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="flex items-center gap-1.5 text-sm [&>svg]:size-3.5">
                    {on ? <ActivityIcon /> : null}
                    {long ? 'Long run' : on ? 'Session' : 'Rest'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Pick your available days to see your typical week.</p>
        )}
        <p className="text-muted-foreground text-xs">
          {days.length > 0 && `${days.length} session${days.length > 1 ? 's' : ''} a week`}
          {days.length > 0 && a?.session_max && ` · ${SESSION_MAX[a.session_max]} max on weekdays`}
          {days.length > 0 && a?.level && ` · ${LEVELS[a.level]?.toLowerCase() ?? a.level} level. `}
          Session details show up here as soon as your plan is ready.
        </p>
      </Panel>
    </>
  )
}

// ---------- Analytics ----------

/** Historique hors COROS : résumé Strava et meilleurs chronos déclarés à l'onboarding (masqué s'il n'y a rien). */
function OnboardingAnalytics() {
  const { data } = useOverview()
  const a = data?.answers
  const st = a?.strava
  const perfs = [...(st?.performances ?? []), ...(a?.performances ?? [])]
  if (!st && !perfs.length) return null
  return (
    <RPanel>
      <RPanelHeader title="Imported history" subtitle={st ? `${st.runs} runs` : undefined} />
      {st && (
        <div className="grid grid-cols-2 divide-x border-t sm:grid-cols-4">
          {[
            ['Runs (12 wks)', String(st.recent.runs)],
            ['Weekly volume', `${st.recent.weeklyKm} km`],
            ['Longest run', `${st.recent.longestKm} km`],
            ['Since', st.since ? String(new Date(st.since).getFullYear()) : '—'],
          ].map(([k, v]) => (
            <div key={k} className="px-6 py-4">
              <p className="text-muted-foreground text-xs">{k}</p>
              <p className="mt-1 font-medium text-2xl tabular-nums tracking-tight">{v}</p>
            </div>
          ))}
        </div>
      )}
      {perfs.length > 0 && (
        <ul className="divide-y border-t">
          {perfs.map((p, i) => (
            <li key={i} className="flex items-center justify-between px-6 py-3 text-sm">
              <span>{p.label}</span>
              <span className="flex items-center gap-4">
                <span className="text-muted-foreground text-xs">{p.date ? formatDate(p.date) : ''}</span>
                <span className="font-medium tabular-nums">{formatDuration(p.seconds)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </RPanel>
  )
}

// ---------- Coach ----------

/** Pacer : une seule carte, le bilan de la semaine se fait dans la conversation. */
function CoachTab() {
  const { data } = useOverview()
  const me = useMe().data
  const first = data?.answers?.identity?.firstName ?? me?.name.split(' ')[0]
  return <CoachChat firstName={first} className="mx-auto h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom))] w-full max-w-4xl md:h-[calc(100dvh-8.5rem)]" />
}

// ---------- Equipment ----------

/** Durée de vie indicative d'une paire, pour la jauge d'usure. */
const SHOE_LIFE_KM = 800

/**
 * Paire telle que renvoyée par le serveur : `km` = kilométrage courant (`baseKm` saisi + sorties synchronisées
 * après `since`, ajoutées à la paire `credited` : celle par défaut, sinon la première en rotation).
 */
type Shoe = { brand: string; model: string; km: number; rotation: boolean; default?: boolean; baseKm?: number; since?: string; credited?: boolean }

function EquipmentPage() {
  const { data, isPending } = useOverview()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  if (isPending) return null
  const a = data?.answers as (CompleteAnswers & { shoes?: Shoe[] }) | null | undefined
  if (!a) return <NoOnboarding />
  const g = a.gear
  const shoes: Shoe[] = data?.shoes ?? a.shoes ?? (g?.brand ? [{ brand: g.brand, model: g.model, km: g.shoeKm, rotation: g.rotation }] : [])
  const watches = (a.wearables ?? []).filter((w) => w !== 'none')
  return (
    <>
      <PageTitle title="Equipment">Your shoes and the devices that track your runs. Tap a pair to edit it.</PageTitle>
      <h2 className="mb-3 font-medium text-sm">Shoes</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shoes.map((s, i) => (
          <ShoeCard key={i} shoe={s} onEdit={() => setEditing(i)} />
        ))}
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-[28px] border border-dashed p-6 text-center transition-colors hover:border-foreground/30 hover:bg-foreground/[0.02]"
        >
          <span className="flex size-10 items-center justify-center rounded-full border text-muted-foreground">
            <PlusIcon className="size-4" />
          </span>
          <span className="font-medium text-sm">Add a pair</span>
          <span className="max-w-56 text-muted-foreground text-xs">Track the mileage of every pair in your rotation.</span>
        </button>
      </div>

      <h2 className="mt-8 mb-3 font-medium text-sm">Devices</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {watches.map((w) => (
          <Link key={w} to="/account/settings" className="flex flex-col items-center gap-4 rounded-[24px] border bg-card px-4 py-6 transition-colors hover:border-foreground/30">
            <span className="flex h-10 items-center">
              <BrandLogo brand={w} className="max-h-10 max-w-24" />
            </span>
            <span className="text-center text-muted-foreground text-xs">{WATCHES[w] ?? w}</span>
          </Link>
        ))}
        {a.strava && (
          <div className="flex flex-col items-center gap-4 rounded-[24px] border bg-card px-4 py-6">
            <span className="flex h-10 items-center">
              <BrandLogo brand="strava" className="max-h-10 max-w-24" />
            </span>
            <span className="text-center text-muted-foreground text-xs">{a.strava.runs} runs imported</span>
          </div>
        )}
      </div>
      <ShoeSheet
        shoes={shoes}
        index={editing}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

/** Fiche d'une paire : marque (liste des marques connues), modèle, kilométrage, rotation ; ajout et suppression. */
function ShoeSheet({ shoes, index, onClose }: { shoes: Shoe[]; index: number | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const open = index !== null
  const current = typeof index === 'number' ? shoes[index] : undefined
  const [draft, setDraft] = useState<Shoe>({ brand: '', model: '', km: 0, rotation: false })
  const [shown, setShown] = useState<number | 'new' | null>(null)
  // Recharge le brouillon à chaque ouverture sur une autre paire.
  if (open && shown !== index) {
    setShown(index)
    // La paire qui reçoit déjà les sorties sans être cochée apparaît cochée : l'enregistrer ne change rien.
    setDraft(current ? { ...current, default: !!current.default || (!!current.credited && !shoes.some((s) => s.default)) } : { brand: '', model: '', km: 0, rotation: false })
  }
  if (!open && shown !== null) setShown(null)
  const brands = useQuery({ queryKey: ['shoe-brands'], queryFn: () => api<string[]>('/lookup/shoe-brands'), enabled: open, staleTime: Infinity })
  const models = useQuery({ queryKey: ['shoes'], queryFn: () => api<{ brand: string; model: string }[]>('/lookup/shoes'), enabled: open, staleTime: Infinity })
  const save = useMutation({
    mutationFn: (next: Shoe[]) => api<{ shoes: Shoe[] }>('/account/shoes', { method: 'PUT', body: { shoes: next, today: toIso(new Date()) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['account', 'overview'] })
      onClose()
    },
  })
  // Une seule paire par défaut : la cocher la retire des autres.
  const commit = () => {
    const next = typeof index === 'number' ? shoes.map((s, i) => (i === index ? draft : s)) : [...shoes, draft]
    save.mutate(draft.default ? next.map((s) => (s === draft ? s : { ...s, default: false })) : next)
  }
  const remove = () => typeof index === 'number' && save.mutate(shoes.filter((_, i) => i !== index))
  const modelOptions = (models.data ?? []).filter((m) => m.brand === draft.brand).map((m) => m.model)

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-6">
          <SheetTitle>{current ? 'Edit pair' : 'Add a pair'}</SheetTitle>
          <SheetDescription>Brand, model and the distance on the shoes today. Runs synced after today are added to the default pair.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <div className="flex h-24 items-center justify-center rounded-2xl border bg-card">
            {draft.brand ? <BrandLogo brand={draft.brand} className="max-h-12 max-w-[60%] text-3xl" /> : <span className="text-muted-foreground text-sm">Pick a brand</span>}
          </div>
          <Combobox
            label="Brand"
            placeholder="Search a brand"
            options={(brands.data ?? []).map((b) => ({ value: b, label: b }))}
            value={draft.brand || undefined}
            onValueChange={(brand) => setDraft((d) => ({ ...d, brand, model: d.brand === brand ? d.model : '' }))}
          />
          <Input label="Model" placeholder="e.g. Speedgoat 6" list="shoe-models" value={draft.model} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} />
          <datalist id="shoe-models">
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Input
            label="Distance (km)"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={String(draft.km)}
            onChange={(e) => setDraft((d) => ({ ...d, km: Math.max(0, Number(e.target.value) || 0) }))}
          />
          <label className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm">
            <span>
              <span className="block font-medium">In rotation</span>
              <span className="block text-muted-foreground text-xs">You currently run in this pair.</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={draft.rotation} onChange={(e) => setDraft((d) => ({ ...d, rotation: e.target.checked }))} />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm">
            <span>
              <span className="block font-medium">Default pair</span>
              <span className="block text-muted-foreground text-xs">New runs are added to it.</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={!!draft.default} onChange={(e) => setDraft((d) => ({ ...d, default: e.target.checked }))} />
          </label>
          {save.error && <p className="text-destructive text-sm">{save.error.message}</p>}
        </div>
        <SheetFooter className="flex-row gap-2 border-t p-6">
          {current && (
            <Button variant="secondary" onClick={remove} disabled={save.isPending}>
              Remove
            </Button>
          )}
          <Button className="flex-1" onClick={commit} loading={save.isPending} disabled={!draft.brand}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** Carte d'une paire, façon profil UTMB : logo de la marque en grand, modèle, kilométrage et usure. */
function ShoeCard({ shoe: s, onEdit }: { shoe: Shoe; onEdit: () => void }) {
  const wear = Math.min(1, s.km / SHOE_LIFE_KM)
  const color = wear >= 0.85 ? '#ef4444' : wear >= 0.6 ? '#f2a33a' : '#43b581'
  return (
    <button type="button" onClick={onEdit} aria-label={`Edit ${s.brand} ${s.model}`} className="flex flex-col overflow-hidden rounded-[28px] border bg-card text-left transition-colors hover:border-foreground/30">
      <div className="relative flex h-32 w-full items-center justify-center sm:h-40 bg-[radial-gradient(80%_90%_at_50%_100%,--theme(--color-foreground/.09),transparent)]">
        <BrandLogo brand={s.brand} className="max-h-12 max-w-[55%] text-4xl" />
        <div className="absolute top-4 right-4 flex gap-1.5">
          {s.credited && (
            <Badge size="sm" tone="success">
              Default
            </Badge>
          )}
          {s.rotation && (
            <Badge size="sm" tone="info">
              In rotation
            </Badge>
          )}
        </div>
      </div>
      <div className="flex w-full flex-1 flex-col gap-4 border-t p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
          <p className="text-muted-foreground text-xs uppercase tracking-wider">{s.brand}</p>
          <p className="mt-0.5 truncate font-medium text-xl tracking-tight">{s.model || 'Unknown model'}</p>
          </div>
          <PencilIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-auto">
          <div className="flex items-baseline justify-between">
            <p className="font-medium text-3xl tabular-nums tracking-tight">
              {Math.round(s.km)}
              <span className="ml-1 text-muted-foreground text-sm">km</span>
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">{wear >= 1 ? 'Time to replace' : `~${Math.round(SHOE_LIFE_KM - s.km)} km left`}</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, wear * 100)}%`, background: color }} />
          </div>
        </div>
      </div>
    </button>
  )
}

// ---------- Profile & Settings ----------

function ProfilePage() {
  const me = useMe().data
  const { data } = useOverview()
  const a = data?.answers
  if (!me) return null
  const rows: [string, string | null | undefined][] = [
    ['E-mail', me.email],
    ['Sex', a?.about?.sex === 'f' ? 'Female' : a?.about?.sex === 'm' ? 'Male' : null],
    ['Year of birth', a?.about?.birthYear ? String(a.about.birthYear) : null],
    ['City', a?.city],
    ['Level', a?.level ? LEVELS[a.level] : null],
    ['UTMB profile', a?.utmb?.name ? `${a.utmb.name}${a.utmb.index ? ` · index ${a.utmb.index}` : ''}` : null],
  ]
  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <RunnerAvatar name={me.name} size="lg" />
        <div>
          <h1 className="font-heading text-2xl">{me.name}</h1>
          <p className="text-muted-foreground text-sm">Runner on {BRAND.name}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <dl className="divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
        <LinkButton asChild variant="secondary" className="mt-auto self-start">
          <Link to="/onboarding">Redo onboarding</Link>
        </LinkButton>
      </Panel>
      <InvitePanel />
      </div>
    </>
  )
}

function AccountSettings() {
  const logout = useLogout()
  const navigate = useNavigate()
  const me = useMe().data
  return (
    <RPanel>
      <RPanelHeader title="Account" subtitle={me?.email} />
      <div className="divide-y border-t">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0">
            <p className="font-medium text-sm">Password</p>
            <p className="text-muted-foreground text-xs">Get an email link to choose a new one.</p>
          </div>
          <LinkButton asChild variant="secondary" size="sm">
            <Link to="/forgot-password">Change password</Link>
          </LinkButton>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0">
            <p className="font-medium text-sm">Session</p>
            <p className="text-muted-foreground text-xs">Sign out of {BRAND.name} on this device.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void logout().then(() => navigate('/'))}>
            <LogOutIcon className="size-4" /> Log out
          </Button>
        </div>
      </div>
    </RPanel>
  )
}

/** Code de parrainage du coureur, à partager à ses amis. */
function InvitePanel() {
  const invite = useQuery({ queryKey: ['account', 'invite'], queryFn: () => api<{ code: string; uses: number; max_uses: number | null }>('/account/invite') })
  const d = invite.data
  if (!d) return null
  const left = d.max_uses === null ? null : Math.max(0, d.max_uses - d.uses)
  return (
    <Panel title="Invite your friends">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-muted-foreground text-xs">Your code</p>
          <p className="whitespace-nowrap font-mono font-semibold text-2xl tracking-wide">{d.code}</p>
        </div>
        <Badge tone={left === 0 ? 'warning' : 'neutral'}>{left === null ? 'Unlimited' : `${left} invite${left > 1 ? 's' : ''} left`}</Badge>
      </div>
      <ShareButtons
        url={`${window.location.origin}/onboarding?code=${d.code}`}
        subject="Join me on Raice.run"
        text={`Join me on Raice.run, an AI running coach that builds a plan just for you. My code: ${d.code}.`}
      />
    </Panel>
  )
}
