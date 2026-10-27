import { useQuery } from '@tanstack/react-query'
import { ActivityIcon, HomeIcon, BarChart3Icon, CalendarDaysIcon, FootprintsIcon, LogOutIcon, MessageCircleIcon, SettingsIcon, ShieldIcon, UserIcon, WatchIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Countdown } from '@/components/arc/countdown/countdown'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Button as LinkButton } from '@/components/shadcn/button'
import { UsageMeter } from '@/components/arc/usage-meter/usage-meter'
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
  SidebarProvider,
} from '@/components/shadcn/sidebar'
import { cn } from '@/lib/utils'
import { api } from '../api'
import { BRAND } from '../brand'
import { DISTANCE_LABELS, PLAN_STATUS, formatDate } from '../format'
import { CoachAvatar } from '../onboarding/CoachAvatar'
import type { CompleteAnswers } from '../onboarding/CompleteOnboarding'
import { formatDuration, formatPace } from '../onboarding/estimate'
import { ShareButtons } from '../invite/ShareButtons'
import { useLogout, useMe } from '../session'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { LockScreen } from '@/components/LockScreen'
import { Toaster } from '@/components/Toaster'
import { useAutoLink } from '@/lib/coach/links'
import { useWeeklyReview } from '@/lib/coach/review'
import { useCorosCallback } from '@/lib/coros/callback'
import { initVault, setupAutoLock, useVault } from '@/lib/lock/vault'
import { startStateSync } from '@/lib/server/state-sync'
import { usePlan, usePlanRepair } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { AdjustPage } from '@/pages/AdjustPage'
import { DebugPage } from '@/pages/DebugPage'
import { OnboardingPage as GoalPage } from '@/pages/OnboardingPage'
import { PlanPage as CoachPlanPage } from '@/pages/PlanPage'
import { SessionPage } from '@/pages/SessionPage'
import { SettingsPage as CoachSettingsPage } from '@/pages/SettingsPage'
import { AnalyticsDashboards, HomeTab, PlanTab } from './CoachTabs'
import { Panel as RPanel, PanelHeader as RPanelHeader } from '@/components/raice/panel'

/**
 * Espace coureur (app.raice.run/compte) : barre latérale avec Plan, Analytics, Coach et Equipment,
 * Profile et Settings en bas à gauche ; contenu en pleine largeur sur desktop.
 * Tout part des réponses du dernier onboarding, en attendant la synchronisation des montres.
 */

type Plan = { id: string; title: string; goal_distance: string; goal_date: string | null; level: string | null; weeks: number | null; sessions_per_week: number | null; status: string }
type Overview = { answers: CompleteAnswers | null; completedAt: string | null; plans: Plan[] }

const NAV = [
  { title: 'Home', path: '/compte/home', icon: <HomeIcon /> },
  { title: 'Plan', path: '/compte/plan', icon: <CalendarDaysIcon /> },
  { title: 'Analytics', path: '/compte/analytics', icon: <BarChart3Icon /> },
  { title: 'Coach', path: '/compte/coach', icon: <MessageCircleIcon /> },
  { title: 'Equipment', path: '/compte/equipment', icon: <FootprintsIcon /> },
]
const FOOTER_NAV = [
  { title: 'Profile', path: '/compte/profil', icon: <UserIcon /> },
  { title: 'Settings', path: '/compte/settings', icon: <SettingsIcon /> },
]

const WEEK = [
  ['mon', 'Lun'],
  ['tue', 'Mar'],
  ['wed', 'Mer'],
  ['thu', 'Jeu'],
  ['fri', 'Ven'],
  ['sat', 'Sam'],
  ['sun', 'Dim'],
] as const
const LEVELS: Record<string, string> = { debutant: 'Débutant', intermediaire: 'Intermédiaire', confirme: 'Confirmé' }
const SESSION_MAX: Record<string, string> = { '30': '30 min', '45': '45 min', '60': '1 h', '90': '1 h 30 et plus' }
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
  if (!me.data) return <Navigate to={`/connexion?next=${encodeURIComponent(location.pathname)}`} replace />
  if (locked) return <LockScreen />

  return (
    <SidebarProvider>
      <RunnerSidebar />
      <SidebarInset>
        <RunnerHeader />
        {coros.status === 'error' && (
          <div className="mx-4 mt-4 rounded-[18px] border border-destructive/50 p-4 text-sm md:mx-8">
            <p className="font-medium">Connexion COROS impossible</p>
            <p className="mt-1 text-muted-foreground">{coros.message}</p>
            <button type="button" className="mt-2 text-sm underline" onClick={coros.dismiss}>
              Fermer
            </button>
          </div>
        )}
        <div className="flex w-full flex-1 flex-col p-4 md:p-8">
          {coros.status === 'pending' || (active && !synced) ? (
            <p className="text-muted-foreground text-sm">{coros.status === 'pending' ? 'Connexion à COROS…' : 'Chargement de ton plan…'}</p>
          ) : (
            <CoachRoutes />
          )}
        </div>
      </SidebarInset>
      <ConfirmSheet />
      <Toaster />
    </SidebarProvider>
  )
}

function CoachRoutes() {
  useAutoLink()
  usePlanRepair()
  useWeeklyReview()
  const hasPlan = usePlan((s) => !!s.plan)
  return (
    <Routes>
      <Route index element={<Navigate to="home" replace />} />
      <Route path="home" element={hasPlan ? <HomeTab /> : <OnboardingPlanPage />} />
      <Route path="plan" element={hasPlan ? <PlanTab /> : <CoachPlanPage />} />
      <Route path="analytics" element={<AnalyticsTab />} />
      <Route path="coach" element={hasPlan ? <AdjustPage /> : <CoachPlaceholder />} />
      <Route path="equipment" element={<EquipmentPage />} />
      <Route path="profil" element={<ProfilePage />} />
      <Route path="settings" element={<SettingsTab />} />
      <Route path="seance/:id" element={<SessionPage />} />
      <Route path="objectif" element={<GoalPage />} />
      <Route path="debug" element={<DebugPage />} />
      <Route path="*" element={<Navigate to="home" replace />} />
    </Routes>
  )
}

function AnalyticsTab() {
  const { data } = useOverview()
  return (
    <div className="flex w-full flex-col gap-8">
      <AnalyticsDashboards />
      {data?.answers && <OnboardingAnalytics />}
    </div>
  )
}

function SettingsTab() {
  return (
    <div className="flex w-full flex-col gap-10">
      <CoachSettingsPage />
      <AccountSettings />
    </div>
  )
}

function RunnerSidebar() {
  const { pathname } = useLocation()
  const me = useMe().data
  const item = (n: (typeof NAV)[number], small?: boolean) => (
    <SidebarMenuItem key={n.path}>
      <SidebarMenuButton asChild isActive={pathname.startsWith(n.path)} tooltip={n.title} size={small ? 'sm' : 'default'}>
        <Link to={n.path}>
          {n.icon}
          <span>{n.title}</span>
        </Link>
      </SidebarMenuButton>
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
          <Link to="/compte/home">
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
            <Avatar name={me.name} size="sm" />
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

function RunnerHeader() {
  const { pathname } = useLocation()
  const page = [...NAV, ...FOOTER_NAV].find((n) => pathname.startsWith(n.path))
  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm md:px-8">
      <CustomSidebarTrigger />
      <span className="flex items-center gap-2 font-medium text-sm [&>svg]:size-4">
        {page?.icon}
        {page?.title}
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
    <section className={cn('flex flex-col gap-4 rounded-[24px] border bg-card p-6', className)}>
      {title && <h2 className="font-medium text-sm">{title}</h2>}
      {children}
    </section>
  )
}

function NoOnboarding() {
  return (
    <EmptyState
      title="Pas encore de plan"
      description="Réponds aux questions de Pacer et on prépare ton plan."
      action={
        <LinkButton asChild>
          <Link to="/onboarding">Créer mon plan</Link>
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
        title={race?.name ?? plan?.title ?? 'Mon plan'}
        action={plan && <Badge tone={(PLAN_STATUS[plan.status]?.tone ?? 'neutral') as BadgeTone}>{PLAN_STATUS[plan.status]?.label ?? plan.status}</Badge>}
      >
        {[race?.detail ?? (plan && DISTANCE_LABELS[plan.goal_distance]), date && `le ${formatDate(date)}`, plan?.weeks && `${plan.weeks} semaines`].filter(Boolean).join(' · ')}
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-3">
        {date && (
          <Panel title="Jour J" className="lg:col-span-2">
            <Countdown target={`${date}T08:00:00`} timeZone="Europe/Paris" units={['days', 'hours']} label="Avant la course" completeLabel="C’est le grand jour" />
          </Panel>
        )}
        <Panel title="Objectif" className={date ? '' : 'lg:col-span-3'}>
          {a?.estimate?.target ? (
            <div>
              <p className="font-semibold text-4xl tabular-nums tracking-tight">{formatDuration(a.estimate.target)}</p>
              {race && <p className="mt-1 text-muted-foreground text-sm">{formatPace(a.estimate.target, race.km)}</p>}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Pas de temps visé : on construit d’abord la régularité.</p>
          )}
        </Panel>
      </div>

      <Panel title="Ta semaine type" className="mt-4">
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
                    {long ? 'Sortie longue' : on ? 'Séance' : 'Repos'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Indique tes jours disponibles pour voir ta semaine type.</p>
        )}
        <p className="text-muted-foreground text-xs">
          {days.length > 0 && `${days.length} séance${days.length > 1 ? 's' : ''} par semaine`}
          {days.length > 0 && a?.session_max && ` · ${SESSION_MAX[a.session_max]} max en semaine`}
          {days.length > 0 && a?.level && ` · niveau ${LEVELS[a.level]?.toLowerCase() ?? a.level}. `}
          Le détail des séances apparaît ici dès que ton plan est prêt.
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
      <RPanelHeader title="Historique importé" subtitle={st ? `Depuis ton export Strava · ${st.runs} sorties` : 'Chronos déclarés à l’onboarding'} />
      {st && (
        <div className="grid grid-cols-2 divide-x border-t sm:grid-cols-4">
          {[
            ['Sorties (12 sem.)', String(st.recent.runs)],
            ['Volume hebdo', `${st.recent.weeklyKm} km`],
            ['Plus longue sortie', `${st.recent.longestKm} km`],
            ['Depuis', st.since ? String(new Date(st.since).getFullYear()) : '—'],
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

function CoachPlaceholder() {
  const { data } = useOverview()
  const me = useMe().data
  const a = data?.answers
  const first = a?.identity?.firstName ?? me?.name.split(' ')[0]
  const lines = [
    `Salut ${first ?? ''} ! Content de te retrouver.`,
    a?.goal?.race ? `On vise ${a.goal.race.name}${a.estimate?.target ? ` en ${formatDuration(a.estimate.target)}` : ''}. Je prépare tes séances.` : 'Je prépare ton plan à partir de tes réponses.',
    'Bientôt, tu pourras me parler ici : décaler une séance, signaler une douleur, me dire que ta semaine est chargée. J’adapterai le plan tout seul.',
  ]
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center gap-3">
        <CoachAvatar className="size-11" />
        <div>
          <p className="font-medium">Pacer</p>
          <p className="text-muted-foreground text-xs">Ton coach</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {lines.map((l, i) => (
          <p key={i} className="w-fit max-w-xl rounded-2xl border bg-card px-4 py-2.5 text-sm">
            {l}
          </p>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 rounded-[22px] border bg-card p-2 pl-4 opacity-60">
        <span className="flex-1 text-muted-foreground text-sm">Le chat avec Pacer arrive bientôt…</span>
        <Button disabled>Envoyer</Button>
      </div>
    </div>
  )
}

// ---------- Equipment ----------

function EquipmentPage() {
  const { data, isPending } = useOverview()
  if (isPending) return null
  const a = data?.answers
  if (!a) return <NoOnboarding />
  const g = a.gear
  const watches = (a.wearables ?? []).filter((w) => w !== 'none')
  return (
    <>
      <PageTitle title="Equipment">Tes chaussures et tes sources de données.</PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Chaussures">
          {g?.brand ? (
            <>
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {g.brand} {g.model}
                </p>
                {g.rotation && <Badge size="sm">En rotation</Badge>}
              </div>
              <UsageMeter label="Usure" unit=" km" decimals={0} limit={800} segments={[{ id: 'km', label: 'Kilomètres', value: g.shoeKm }]} freeLabel="restants" overLabel="À remplacer" warnAt={0.85} />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Aucune paire renseignée.</p>
          )}
        </Panel>
        <Panel title="Montres et applications">
          <ul className="flex flex-col gap-2">
            {watches.map((w) => (
              <li key={w} className="flex items-center justify-between rounded-[16px] border bg-background p-3 text-sm">
                <span className="flex items-center gap-2">
                  <WatchIcon className="size-4 text-muted-foreground" /> {WATCHES[w] ?? w}
                </span>
                <Badge size="sm" tone="neutral">
                  Connexion bientôt
                </Badge>
              </li>
            ))}
            <li className="flex items-center justify-between rounded-[16px] border bg-background p-3 text-sm">
              <span className="flex items-center gap-2">
                <img src="/partners/strava.png" alt="" className="size-5 rounded" /> Strava
              </span>
              <Badge size="sm" tone={a.strava ? 'success' : 'neutral'}>
                {a.strava ? `${a.strava.runs} sorties importées` : 'Non importé'}
              </Badge>
            </li>
          </ul>
        </Panel>
      </div>
    </>
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
    ['Sexe', a?.about?.sex === 'f' ? 'Femme' : a?.about?.sex === 'm' ? 'Homme' : null],
    ['Année de naissance', a?.about?.birthYear ? String(a.about.birthYear) : null],
    ['Niveau', a?.level ? LEVELS[a.level] : null],
    ['Profil UTMB', a?.utmb?.name ? `${a.utmb.name}${a.utmb.index ? ` · index ${a.utmb.index}` : ''}` : null],
  ]
  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={me.name} size="lg" />
        <div>
          <h1 className="font-heading text-2xl">{me.name}</h1>
          <p className="text-muted-foreground text-sm">Coureur sur {BRAND.name}</p>
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel>
        <dl className="divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
        <LinkButton asChild variant="secondary" className="self-start">
          <Link to="/onboarding">Refaire l’onboarding</Link>
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
  return (
    <>
      <PageTitle title="Compte" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Mot de passe">
          <p className="text-muted-foreground text-sm">Reçois un lien par e-mail pour en choisir un nouveau.</p>
          <LinkButton asChild variant="secondary" className="self-start">
            <Link to="/mot-de-passe-oublie">Changer de mot de passe</Link>
          </LinkButton>
        </Panel>
        <Panel title="Session">
          <Button variant="secondary" className="self-start" onClick={() => void logout().then(() => navigate('/'))}>
            <LogOutIcon className="size-4" /> Se déconnecter
          </Button>
        </Panel>
      </div>
    </>
  )
}

/** Code de parrainage du coureur, à partager à ses amis. */
function InvitePanel() {
  const invite = useQuery({ queryKey: ['account', 'invite'], queryFn: () => api<{ code: string; uses: number; max_uses: number | null }>('/account/invite') })
  const d = invite.data
  if (!d) return null
  const left = d.max_uses === null ? null : Math.max(0, d.max_uses - d.uses)
  return (
    <Panel title="Invite tes potes">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs">Ton code</p>
          <p className="font-mono font-semibold text-2xl tracking-wide">{d.code}</p>
        </div>
        <Badge tone={left === 0 ? 'warning' : 'neutral'}>{left === null ? 'Illimité' : `${left} invitation${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}`}</Badge>
      </div>
      <ShareButtons
        url={`${window.location.origin}/onboarding?code=${d.code}`}
        subject="Je t’invite sur Raice.run"
        text={`Je t’invite sur Raice.run, un coach running qui construit ton plan sur mesure. Mon code : ${d.code}.`}
      />
    </Panel>
  )
}
