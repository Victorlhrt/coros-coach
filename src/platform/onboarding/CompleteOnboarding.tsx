import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ActivityIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  FootprintsIcon,
  CompassIcon,
  FlagIcon,
  LayoutListIcon,
  ChevronDownIcon,
  CheckIcon,
  MountainIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  SproutIcon,
  TrashIcon,
  TrendingUpIcon,
  WatchIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import { Combobox } from '@/components/arc/combobox/combobox'
import { DatePicker } from '@/components/arc/date-picker/date-picker'
import { FileDropzone } from '@/components/arc/file-dropzone/file-dropzone'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Input } from '@/components/arc/input/input'
import { NumberField } from '@/components/arc/number-field/number-field'
import { Progress } from '@/components/arc/progress/progress'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { Rating } from '@/components/arc/rating/rating'
import { RulerSlider } from '@/components/arc/ruler-slider/ruler-slider'
import { SearchField } from '@/components/arc/search-field/search-field'
import { Stepper } from '@/components/arc/stepper/stepper'
import { Switch } from '@/components/arc/switch/switch'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { Textarea } from '@/components/arc/textarea/textarea'
import { api, type Variant } from '../api'
import { connectGarminOnboarding, type GarminExpiry } from '@/lib/garmin/client'
import { GarminKeyForm } from '../runner/GarminConnect'
import { CoachAvatar } from './CoachAvatar'
import { CoachBubble, TypingBubble, UserBubble } from './ChatBubbles'
import { CodeStep } from './CodeStep'
import { readStravaExport, type StravaSummary } from './strava'
import { InsightTiles, hasInsights, watchName, watchPerformances, type WatchInsights } from './WatchInsights'
import { distanceCategory, formatDuration, formatPace, parseDuration, predict, type Performance } from './estimate'

/**
 * Parcours « Complet » (version de test) : motivation, montre, identité et profil UTMB, objectif et course,
 * estimation de temps, santé, chaussures, puis écran de génération. Tout est construit avec les composants Arc UI.
 */

type Race = {
  id: string
  name: string
  detail: string
  km: number
  elevation: number
  date: string | null
  source: 'raice' | 'utmb' | 'saisie'
}
type UtmbRunner = {
  uri: string
  name: string
  ageGroup: string
  nationality: string
  index: number | null
  picture: string | null
}
type UtmbProfile = {
  uri: string
  name: string
  indexes: { piCategory: string; index: number }[]
  results: {
    date: string
    race: string
    km: number
    elevation: number
    time: string | null
  }[]
}
type Shoe = { id: string; brand: string; model: string; use: string }
/** Profil public trouvé en ligne par le serveur (sites de résultats hors UTMB). */
type WebProfile = {
  found: boolean
  summary: string | null
  sources: { site: string; url: string; title: string }[]
  results: { date: string | null; race: string; distance: string | null; time: string | null; rank: string | null; url: string | null }[]
  photos: { url: string; source: string; pageUrl: string | null }[]
}

type StepProps = {
  answers: CompleteAnswers
  patch: (p: Partial<CompleteAnswers>) => void
}

export type CompleteAnswers = {
  reason?: string
  wearables?: string[]
  has_watch?: 'yes' | 'no'
  data_source?: 'strava' | 'none'
  connected?: string[]
  identity?: { firstName: string; lastName: string; email: string }
  utmb?: { uri: string; name: string; index?: number | null } | null
  /** Ville où la personne court (lue aussi par le classement par ville). */
  city?: string
  /** Photo de profil confirmée par la personne (« C'est moi ») : Gravatar, UTMB ou trouvée en ligne. `null` : aucune. */
  photoUrl?: string | null
  /** Résultats trouvés en ligne et confirmés par la personne. */
  online?: { summary: string | null; sources: WebProfile['sources']; results: WebProfile['results'] } | null
  goal?: {
    type: string
    terrain: 'road' | 'trail'
    race: Race | null
    date: string | null
  }
  performances?: Performance[]
  estimate?: { predicted: number | null; target: number | null }
  health?: {
    pains: string[]
    painLevel: number
    events: string[]
    weeklyKm: number
    notes: string
  }
  gear?: {
    brand: string | null
    model: string
    shoeKm: number
    rotation: boolean
  }
  // Champs à plat repris par la demande de plan côté serveur.
  distance?: string
  race_date?: string | null
  weekly_km?: number
  strava?: StravaSummary | null
  about?: { sex: string | null; birthYear: number | null }
  experience?: string
  schedule?: { days: string[]; longDay: string | null }
  session_max?: string
  days?: string[]
  level?: string
  strava_need?: string
  /** Aperçu de la montre connectée (volume, records, VO2max…), lu en arrière-plan ; repris par la génération du plan. */
  watch_insights?: WatchInsights | null
  /** Réponses pré-remplies depuis la montre (« weekly_km », « days ») : Pacer le dit dans sa question. */
  watch_prefilled?: string[]
}

const STEPS = [
  { id: 'code', label: 'Invite' },
  { id: 'identity', label: 'You' },
  { id: 'reason', label: 'Motivation' },
  { id: 'watch', label: 'Watch' },
  { id: 'wearables', label: 'Model' },
  { id: 'connect', label: 'Connect' },
  { id: 'nowatch', label: 'Data' },
  { id: 'strava', label: 'Strava' },
  { id: 'profile', label: 'Profile' },
  { id: 'about', label: 'About you' },
  { id: 'experience', label: 'Experience' },
  { id: 'goal', label: 'Goal' },
  { id: 'target', label: 'Race' },
  { id: 'estimate', label: 'Estimate' },
  { id: 'volume', label: 'Volume' },
  { id: 'pains', label: 'Pain' },
  { id: 'events', label: 'Recent' },
  { id: 'days', label: 'Availability' },
  { id: 'duration', label: 'Duration' },
  { id: 'gear', label: 'Gear' },
  { id: 'generate', label: 'Plan' },
]

const REASONS = [
  {
    value: 'race',
    label: 'Train for a race',
    description: 'I have a date and a goal in mind.',
    icon: <FlagIcon />,
  },
  {
    value: 'progress',
    label: 'Get better',
    description: 'Run faster or longer.',
    icon: <TrendingUpIcon />,
  },
  {
    value: 'structure',
    label: 'Structure my runs',
    description: 'Stop running at random.',
    icon: <LayoutListIcon />,
  },
  {
    value: 'comeback',
    label: 'Get back into it',
    description: 'After a break or an injury.',
    icon: <RotateCcwIcon />,
  },
  {
    value: 'start',
    label: 'Start running',
    description: 'I’m a beginner.',
    icon: <SproutIcon />,
  },
]

/** Logos des montres (`invert` pour les marques noires sur fond sombre). Sans logo : icône générique. */
const WEARABLES = [
  {
    id: 'coros',
    name: 'COROS',
    logo: '/partners/coros.png',
    invert: false,
    available: true,
  },
  {
    id: 'garmin',
    name: 'Garmin',
    logo: '/partners/garmin.png',
    invert: true,
    available: true,
  },
  {
    id: 'apple',
    name: 'Apple Watch',
    logo: '/partners/apple.png',
    invert: true,
    available: false,
  },
  {
    id: 'suunto',
    name: 'Suunto',
    logo: '/partners/suunto-mark.svg',
    available: false,
  },
  {
    id: 'polar',
    name: 'Polar',
    logo: '/partners/polar-mark.svg',
    available: false,
  },
]

// Valeurs stockées (et lues par la génération du plan) en français, libellés affichés en anglais.
const PAIN_LABELS: Record<string, string> = {
  Genou: 'Knee',
  'Tendon d’Achille': 'Achilles tendon',
  Mollet: 'Calf',
  Périostite: 'Shin splints',
  Ischios: 'Hamstrings',
  Hanche: 'Hip',
  Dos: 'Back',
  'Voûte plantaire': 'Arch of the foot',
  Cheville: 'Ankle',
}
const PAINS = Object.entries(PAIN_LABELS).map(([value, label]) => ({ value, label }))
const EVENTS = [
  { value: 'injury', label: 'Recent injury' },
  { value: 'illness', label: 'Illness' },
  { value: 'break', label: 'Break of more than a month' },
  { value: 'pregnancy', label: 'Pregnancy or postpartum' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'stress', label: 'Busy period (work, sleep)' },
]
const SEXES = [
  { value: 'f', label: 'Woman' },
  { value: 'm', label: 'Man' },
  { value: 'x', label: 'I’d rather not say' },
]
const EXPERIENCES = [
  {
    value: 'lt1',
    label: 'Less than a year',
    icon: <SproutIcon />,
    level: 'debutant',
  },
  {
    value: '1to3',
    label: '1 to 3 years',
    icon: <TrendingUpIcon />,
    level: 'intermediaire',
  },
  {
    value: 'gt3',
    label: 'More than 3 years',
    icon: <FlagIcon />,
    level: 'confirme',
  },
]
const WEEKDAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]
const DAY_NAMES: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}
const DURATIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 h' },
  { value: '90', label: '1 h 30 or more' },
]
/** Villes proposées d'office ; « Other » ouvre une saisie libre. */
const CITIES = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille', 'Toulouse', 'Nantes', 'Annecy', 'Chamonix', 'Grenoble']
const OTHER_CITY = '__other'
const MANUAL_DISTANCES = [
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '21.1', label: 'Half marathon' },
  { value: '42.195', label: 'Marathon' },
]

/** Accès sur invitation : la question du code, posée avant que le parcours existe côté serveur. */
export type InviteGateProps = {
  /** Code validé (gardé pour la visite), null tant qu'il n'y en a pas. */
  code: string | null
  /** Code reçu par lien (`?code=`), vérifié tout seul. */
  initialCode: string | null
  /** Lien de parrainage d'un ami (`?ref=`), repris par la liste d'attente. */
  referrer: string | null
  /** Erreur au démarrage du parcours (code épuisé entre-temps…) : retour à la question du code. */
  error?: string
  onValid: (code: string) => void
}

/** Parcours de test du back office (`?flow=`, aperçus seulement) : réponses de branche données d'avance. */
export const PREVIEW_FLOWS: Record<string, { answers: Partial<CompleteAnswers>; at: string }> = {
  coros: { answers: { has_watch: 'yes', wearables: ['coros'] }, at: 'connect' },
  garmin: { answers: { has_watch: 'yes', wearables: ['garmin'] }, at: 'connect' },
  strava: { answers: { has_watch: 'no', wearables: [], data_source: 'strava' }, at: 'strava' },
}
/** Réponses de test des premières étapes, pour arriver vite sur la branche testée (toujours modifiables). */
const PREVIEW_BASE: Partial<CompleteAnswers> = {
  identity: { firstName: 'Test', lastName: 'Runner', email: 'preview@raice.run' },
  reason: 'race',
}

/** Fil des questions selon les réponses (la question du code n'existe que pour les visiteurs sans compte). */
function flowFor(a: CompleteAnswers, gated: boolean) {
  // « M'entraîner » n'a pas de course à choisir : l'étape Course disparaît du fil.
  return STEPS.filter((s) => {
    if (s.id === 'code') return gated
    if (s.id === 'target') return a.goal?.type !== 'train'
    if (s.id === 'wearables') return a.has_watch === 'yes'
    if (s.id === 'connect') return a.has_watch === 'yes' && (a.wearables ?? []).some((w) => w === 'coros' || w === 'garmin')
    if (s.id === 'nowatch') return a.has_watch === 'no'
    if (s.id === 'strava') return a.has_watch === 'no' && a.data_source === 'strava'
    return true
  })
}

/** Point de départ : reprise d'un parcours (question suivant la dernière réponse), parcours de test, ou code déjà validé. */
function initialState({ gate, preset, resume }: { gate?: InviteGateProps; preset?: string | null; resume?: ResumeState | null }) {
  const empty: CompleteAnswers = { wearables: [], performances: [] }
  if (resume) {
    const answers = { ...empty, ...resume.answers }
    const f = flowFor(answers, false)
    const next = resume.nextStepId ? f.findIndex((s) => s.id === resume.nextStepId) : -1
    if (next >= 0) return { answers, index: next }
    const at = resume.stepId ? f.findIndex((s) => s.id === resume.stepId) : -1
    return { answers, index: at >= 0 ? Math.min(at + 1, f.length - 1) : 0 }
  }
  const flow = preset ? PREVIEW_FLOWS[preset] : undefined
  if (flow) {
    const answers = { ...empty, ...PREVIEW_BASE, ...flow.answers }
    return { answers, index: Math.max(0, flowFor(answers, false).findIndex((s) => s.id === flow.at)) }
  }
  return { answers: empty, index: gate?.code ? 1 : 0 }
}

/** Parcours repris depuis le lien de relance : réponses enregistrées et dernière question répondue. */
export type ResumeState = { answers: CompleteAnswers; stepId: string | null; nextStepId?: string | null }

export function CompleteOnboarding({
  sessionId,
  preview,
  ready,
  onSave,
  onComplete,
  gate,
  preset,
  resume,
  notice,
}: {
  variant: Variant
  sessionId: string | null
  preview: boolean
  ready: boolean
  onSave: (answers: CompleteAnswers, stepReached: number, stepId: string) => Promise<void>
  onComplete: (answers: CompleteAnswers) => Promise<void>
  /** Visiteur sans compte : le code d'invitation est la première question. */
  gate?: InviteGateProps
  /** Aperçu seulement : parcours de test (`coros`, `garmin`, `strava`). */
  preset?: string | null
  resume?: ResumeState | null
  /** Petit mot de Pacer avant la première question (lien de relance expiré…). */
  notice?: string
}) {
  const [init] = useState(() => initialState({ gate, preset, resume }))
  const [index, setIndex] = useState(init.index)
  const [a, setA] = useState<CompleteAnswers>(init.answers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const patch = (p: Partial<CompleteAnswers>) => setA((cur) => ({ ...cur, ...p }))
  const qc = useQueryClient()

  /**
   * Première étape envoyée : le lead est enregistré (hors aperçu), puis la photo Gravatar et la recherche en ligne
   * partent en arrière-plan pour être prêtes à l'étape Profil. Un échec ne bloque jamais le parcours.
   */
  async function captureLead(id: NonNullable<CompleteAnswers['identity']>) {
    if (!sessionId) return
    const person = { firstName: id.firstName.trim(), lastName: id.lastName.trim(), email: id.email.trim().toLowerCase() }
    if (!preview) await api('/onboarding/leads', { body: { sessionId, ...person } }).catch(() => null)
    void qc.prefetchQuery(gravatarQuery(person.email))
    void qc.prefetchQuery(webProfileQuery(sessionId, person))
  }
  const gated = !!gate
  const flow = flowFor(a, gated)
  const step = flow[Math.min(index, flow.length - 1)]
  // Numéro d'étape enregistré (statistiques) : la question du code, posée avant le parcours, n'est pas comptée.
  const offset = gated ? 1 : 0
  // Pas de retour vers la question du code une fois validé.
  const canBack = index > 0 && flow[index - 1]?.id !== 'code'

  // Code refusé au démarrage du parcours (épuisé entre-temps) : retour à la question du code.
  useEffect(() => {
    if (gate && !gate.code && index > 0) setIndex(0)
  }, [gate?.code]) // eslint-disable-line react-hooks/exhaustive-deps

  const valid: Record<string, boolean> = {
    code: !!gate?.code,
    reason: !!a.reason,
    wearables: (a.wearables?.length ?? 0) > 0,
    connect: true,
    strava: true,
    identity: !!a.identity?.firstName.trim() && !!a.identity.lastName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.identity.email.trim()),
    profile: true,
    about: !!a.city?.trim(),
    experience: !!a.experience,
    days: (a.schedule?.days.length ?? 0) > 0,
    duration: !!a.session_max,
    goal: !!a.goal?.type,
    target: !!a.goal?.race && (a.goal.type !== 'race' || !!a.goal.date),
    estimate: true,
    volume: true,
    pains: true,
    events: true,
    gear: true,
    generate: true,
  }

  /** Enregistre la réponse (avec `extra` pour les réponses rapides, envoyées dès le clic) et passe à la question suivante. */
  async function next(extra: Partial<CompleteAnswers> = {}) {
    setBusy(true)
    setError('')
    try {
      const flat = withPlanFields({ ...a, ...extra })
      if (step.id === 'identity' && flat.identity) await captureLead(flat.identity)
      await onSave(flat, index + 1 - offset, step.id)
      setA(flat)
      setIndex(index + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Statistique communauté (null tant que l'échantillon est trop petit) : reprise dans les compliments du coach.
  const weeklyKm = a.health?.weeklyKm
  const weeklyStat = useQuery({
    queryKey: ['stats', 'weekly-km', weeklyKm],
    queryFn: () => api<{ percentile: number | null }>(`/lookup/stats/weekly-km?value=${weeklyKm}`),
    enabled: weeklyKm !== undefined,
    staleTime: 600_000,
  })
  const ctx = { weeklyPct: weeklyStat.data?.percentile ?? null, gated, referred: !!gate?.referrer }

  /**
   * Dès qu'une montre est connectée, son aperçu est lu en arrière-plan pendant que la conversation continue.
   * À l'arrivée : réponses pré-remplies (si pas encore données) et carte de Pacer à l'étape en cours.
   */
  const watch = (a.connected ?? []).find((c) => c === 'coros' || c === 'garmin')
  const watchInsights = useQuery({
    queryKey: ['watch-insights', sessionId, watch],
    queryFn: () => api<WatchInsights>(`/connect/insights?sessionId=${sessionId}`),
    enabled: !!sessionId && !!watch,
    staleTime: 600_000,
    retry: 2,
  })
  const [insightsAt, setInsightsAt] = useState<string | null>(null)
  useEffect(() => {
    const data = watchInsights.data
    if (!data || !hasInsights(data) || a.watch_insights?.fetchedAt === data.fetchedAt) return
    setA((cur) => ({ ...cur, ...watchPrefill(cur, data) }))
    setInsightsAt((at) => at ?? step.id)
  }, [watchInsights.data, a.watch_insights?.fetchedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const insightCard = (at: string) =>
    insightsAt === at && a.watch_insights ? (
      <div className="flex flex-col gap-2">
        <CoachBubble first>Here’s what I see on your {watchName(a.watch_insights)}.</CoachBubble>
        <div className="flex animate-[fade-in_300ms_ease-out] gap-2">
          <span className="w-9 shrink-0" />
          <div className="w-full max-w-[85%] sm:max-w-sm">
            <InsightTiles insights={a.watch_insights} />
          </div>
        </div>
      </div>
    ) : null

  // Pacer écrit ses bulles une à une, avec un temps de frappe ; la zone de réponse vient ensuite.
  const linesFor = (id: string) => {
    const l = coachLines(id, a, ctx)
    return notice && id === flow[0]?.id ? [l[0], notice, ...l.slice(1)] : l
  }
  const lines = linesFor(step.id)
  const [shown, setShown] = useState(0)
  const [typing, setTyping] = useState(true)
  useEffect(() => {
    setShown(0)
    setTyping(true)
    const timers: number[] = []
    let at = 650
    lines.forEach((line, i) => {
      at += Math.min(1300, 450 + line.length * 12)
      timers.push(window.setTimeout(() => setShown(i + 1), at))
      if (i < lines.length - 1) timers.push(window.setTimeout(() => setTyping(true), at + 250))
      at += 250
    })
    timers.push(window.setTimeout(() => setTyping(false), at - 250))
    return () => timers.forEach(window.clearTimeout)
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready2 = shown >= lines.length

  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [index, shown, typing])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <CoachAvatar className="size-11" />
        <div className="flex-1">
          <p className="font-medium">Pacer</p>
          <p className="text-muted-foreground text-xs">{typing && !ready2 ? 'typing…' : `Your coach · ${Math.min(index + 1, flow.length)} / ${flow.length}`}</p>
        </div>
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-foreground transition-all duration-500" style={{ width: `${((index + 1) / flow.length) * 100}%` }} />
        </span>
      </div>

      {/* Échanges passés : les bulles du coach, puis la réponse résumée */}
      {flow.slice(0, index).map((s) => (
        <div key={s.id} className="flex flex-col gap-2">
          {linesFor(s.id).map((line, i) => (
            <CoachBubble key={i} first={i === 0}>
              {line}
            </CoachBubble>
          ))}
          {insightCard(s.id)}
          <UserBubble>{s.id === 'code' ? `Code ${gate?.code ?? ''} ✓` : summarize(s.id, a)}</UserBubble>
        </div>
      ))}

      {/* Question en cours, bulle par bulle */}
      <div className="flex flex-col gap-2">
        {lines.slice(0, shown).map((line, i) => (
          <CoachBubble key={`${step.id}-${i}`} first={i === 0}>
            {line}
          </CoachBubble>
        ))}
        {!ready2 && typing && <TypingBubble avatar={shown === 0} />}
        {ready2 && insightCard(step.id)}
      </div>

      {ready2 &&
        (step.id === 'code' && gate ? (
          <CodeStep
            initialCode={gate.initialCode}
            referrer={gate.referrer}
            error={gate.error}
            onValid={(code) => {
              gate.onValid(code)
              setIndex(1)
            }}
          />
        ) : step.id === 'generate' ? (
          <div className="animate-[fade-in_300ms_ease-out] rounded-[26px] border bg-card p-5">
            <GenerateStep answers={a} preview={preview} onDone={() => onComplete(withPlanFields(a))} />
          </div>
        ) : QUICK[step.id] ? (
          <QuickReplies
            options={QUICK[step.id].options}
            disabled={!ready || busy}
            onPick={(value) => void next(QUICK[step.id].answer(value))}
            onBack={canBack ? () => setIndex(index - 1) : undefined}
          />
        ) : (
          <>
            {NOTHING[step.id] && (
              <div className="flex animate-[fade-in_300ms_ease-out] justify-end">
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => void next(NOTHING[step.id].answer(a))}
                  className="rounded-full border bg-card px-4 py-2.5 text-sm transition-colors hover:border-foreground/50 hover:bg-foreground hover:text-background disabled:opacity-50"
                >
                  {NOTHING[step.id].label}
                </button>
              </div>
            )}
            <form
              className="flex animate-[fade-in_300ms_ease-out] flex-col gap-6 rounded-[26px] border bg-card p-5"
              onSubmit={(e) => {
                e.preventDefault()
                if (valid[step.id] && ready) void next()
              }}
            >
              {step.id === 'wearables' && <WearablesStep answers={a} patch={patch} />}
              {step.id === 'connect' && <ConnectStep answers={a} patch={patch} sessionId={sessionId} guideOpen={preset === 'garmin'} />}
              {step.id === 'strava' && <StravaImport answers={a} patch={patch} />}
              {step.id === 'identity' && <IdentityStep answers={a} patch={patch} />}
              {step.id === 'profile' && <ProfileStep answers={a} patch={patch} sessionId={sessionId} />}
              {step.id === 'about' && <AboutStep answers={a} patch={patch} />}
              {step.id === 'days' && <DaysStep answers={a} patch={patch} />}
              {step.id === 'target' && <TargetStep answers={a} patch={patch} />}
              {step.id === 'estimate' && <EstimateStep answers={a} patch={patch} />}
              {step.id === 'volume' && <VolumeStep answers={a} patch={patch} />}
              {step.id === 'pains' && <PainsStep answers={a} patch={patch} />}
              {step.id === 'events' && <EventsStep answers={a} patch={patch} />}
              {step.id === 'gear' && <GearStep answers={a} patch={patch} />}
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <Button type="button" variant="ghost" size="sm" disabled={!canBack || busy} onClick={() => setIndex(index - 1)}>
                  <ArrowLeftIcon className="size-4" /> Edit
                </Button>
                <Button type="submit" loading={busy} disabled={!ready || !valid[step.id]}>
                  {step.id === 'gear' ? 'Create my plan' : (step.id === 'connect' && !a.connected?.length) || (step.id === 'strava' && !a.strava) ? 'Later' : 'Send'}{' '}
                  <SendIcon className="size-4" />
                </Button>
              </div>
            </form>
          </>
        ))}
      <div ref={endRef} />
    </div>
  )
}

/** Réponses rapides façon chat : un clic envoie la réponse. */
function QuickReplies({
  options,
  onPick,
  onBack,
  disabled,
}: {
  options: { value: string; label: string; icon?: React.ReactNode }[]
  onPick: (value: string) => void
  onBack?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex animate-[fade-in_300ms_ease-out] flex-col items-end gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(o.value)}
            className="flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm transition-colors hover:border-foreground/50 hover:bg-foreground hover:text-background disabled:opacity-50 [&_svg]:size-4"
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
      {onBack && (
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
          <ArrowLeftIcon className="size-3" /> Edit my previous answer
        </button>
      )}
    </div>
  )
}

// ---------- Conversation ----------

/** Ce que dit Pacer à chaque étape (peut dépendre des réponses précédentes). */
const REASON_PRAISE: Record<string, string> = {
  race: 'A race in your sights is the best motivation there is.',
  progress: 'You want to get better: we’re going to get along just fine.',
  structure: 'Good call, consistency is what makes you improve.',
  comeback: 'Well done for getting back into it, that’s often the hardest part.',
  start: 'Welcome to running, you’re going to love it.',
}

function volumePraise(km: number, pct: number | null) {
  if (pct !== null && pct >= 50) return `${km} km a week: you run more than ${pct}% of Raice.run runners. Respect.`
  if (km >= 60) return `${km} km a week is serious volume. Hats off.`
  if (km >= 30) return `${km} km a week, nice and consistent.`
  if (km > 0) return `${km} km a week is a good base to build on.`
  return 'We’ll start from zero, nice and easy. That’s the best way to begin.'
}

/** Répliques de Pacer : un petit mot sur la réponse précédente, puis la question. */
function coachLines(step: string, a: CompleteAnswers, ctx: { weeklyPct: number | null; gated: boolean; referred: boolean }): string[] {
  const first = a.identity?.firstName.trim()
  const race = a.goal?.race
  const h = a.health
  switch (step) {
    case 'code':
      return [
        'Hi! I’m Pacer, your running coach.',
        ctx.referred
          ? 'A friend sent you here. Raice.run is invite-only for now: what’s your invite code?'
          : 'Raice.run is invite-only for now, opening in small waves. What’s your invite code?',
      ]
    case 'identity':
      return [
        ctx.gated ? 'You’re in, welcome!' : 'Hi! I’m Pacer, your running coach.',
        'First, let’s get to know each other: your first name, last name and email.',
      ]
    case 'reason':
      return [`Nice to meet you${first ? `, ${first}` : ''}!`, 'Before I build your plan, tell me: what brings you here?']
    case 'watch':
      return [REASON_PRAISE[a.reason ?? ''] ?? 'Got it.', 'Do you run with a watch or another wearable?']
    case 'wearables':
      return ['Perfect.', 'Which one? You can pick more than one.']
    case 'connect': {
      const w = a.wearables ?? []
      return w.includes('coros')
        ? ['COROS, great choice.', 'Connect your account: I’ll pull your history while we chat.']
        : ['Garmin, noted.', 'Connect it with a Personal API key from Garmin Connect: follow the steps, it takes a minute.']
    }
    case 'nowatch':
      return ['No problem.', 'Do you log your runs on Strava, or do you run without tracking anything?']
    case 'strava':
      return ['Strava will do just fine.', 'Import your history: I use it to calibrate your plan and your paces.']
    case 'profile': {
      const w = a.wearables ?? []
      const st = a.strava
      const praise = st
        ? `I read your ${st.runs} Strava runs${st.recent.runs ? `, ${st.recent.runs} of them in the last 12 weeks` : ''}. Nice history.`
        : a.connected?.includes('coros')
          ? 'COROS connected: I’m reading your workouts while we get to know each other.'
          : a.has_watch === 'no'
            ? 'No problem, we’ll go by feel. That works really well.'
            : w.some((x) => x === 'coros' || x === 'garmin')
              ? 'No problem, you can connect your watch later from your account.'
              : 'Noted, I’ll let you know as soon as your watch is supported.'
      return [praise, 'I also looked for your public race results online, on UTMB and other results sites. Is this you?']
    }
    case 'about':
      return [
        a.utmb?.index
          ? `UTMB index ${a.utmb.index}, impressive record.`
          : a.utmb || a.online
            ? 'Great, I’ll use your results to calibrate your plan.'
            : a.photoUrl
              ? 'Nice photo, I’ve added it to your profile.'
              : 'No problem, we’ll start from your answers.',
        'Where do you usually run? And to set your zones and paces: are you a woman or a man, and what year were you born? Those two are optional.',
      ]
    case 'experience':
      return [
        a.about?.birthYear ? 'Thanks, noted.' : 'No problem, we’ll do without.',
        a.strava?.since
          ? `Your first Strava run goes back to ${new Date(a.strava.since).getFullYear()}. How long have you been running in total?`
          : a.watch_insights?.since
            ? `Your ${watchName(a.watch_insights)} history goes back to ${new Date(a.watch_insights.since).getFullYear()}. How long have you been running in total?`
            : 'How long have you been running?',
      ]
    case 'goal':
      return [
        a.experience === 'gt3'
          ? 'An experienced runner, I’ll be able to push you a bit.'
          : a.experience === 'lt1'
            ? 'Great, we’ll build a solid base.'
            : 'Good experience, plenty to build on.',
        'What’s your goal right now?',
      ]
    case 'target':
      return a.goal?.type === 'distance'
        ? ['A new milestone, great idea.', 'What distance do you want to run?']
        : ['A race, love it.', 'Which one? Pick the distance, find it in the list, then give me the date.']
    case 'estimate':
      return race
        ? [`${race.name}, great choice.`, 'I ran the numbers: here’s what I think you can do. Adjust it if you want to aim faster or play it safer.']
        : a.watch_insights?.bests.length
          ? ['Consistency is key.', `I’ve got your best times from your ${watchName(a.watch_insights)}. Add a more recent one if you have it.`]
          : ['Consistency is key.', 'Give me a recent time: I’ll calibrate your paces with it.']
    case 'volume': {
      const e = a.estimate
      const praise =
        e?.target && e.predicted
          ? e.target < e.predicted * 0.97
            ? 'Ambitious goal, I like your mindset.'
            : 'Realistic goal: that’s how you finish strong.'
          : 'Thanks, noted.'
      return [
        praise,
        a.strava?.recent.runs
          ? `According to Strava, you’re running around ${a.strava.recent.weeklyKm} km a week: I’ve filled it in. Change it if things have changed.`
          : a.watch_prefilled?.includes('weekly_km') && a.watch_insights?.weeklyKm != null
            ? `From your ${watchName(a.watch_insights)}: about ${a.watch_insights.weeklyKm} km a week. I’ve filled it in, change it if needed.`
            : 'How many kilometres are you running per week right now?',
      ]
    }
    case 'pains':
      return [volumePraise(h?.weeklyKm ?? 0, ctx.weeklyPct), 'Any pain in the last few weeks? Tap the areas that bothered you.']
    case 'events':
      return [
        h?.pains.length ? 'Thanks for telling me, I’ll factor it into your training load.' : 'No pain, perfect.',
        'Has anything happened recently? Injury, illness, a break, a busy period… it all counts.',
      ]
    case 'days':
      return [
        h?.events.length ? 'Thanks for being upfront, we’ll ease you back in.' : 'Nothing to report, ideal for getting started.',
        a.watch_prefilled?.includes('days') && a.watch_insights?.usualDays
          ? `From your ${watchName(a.watch_insights)}, you usually run on ${listDays(a.watch_insights.usualDays)}: I’ve pre-selected them. Change them if needed, and pick your long run day.`
          : 'Which days can you run? And which one for your long run?',
      ]
    case 'duration': {
      const n = a.schedule?.days.length ?? 0
      return [
        n >= 5 ? `${n} days a week, that’s motivation!` : n >= 3 ? `${n} days is perfect for making progress.` : 'Few days but well used, that works really well.',
        'On weekdays, how much time can you give each session?',
      ]
    }
    case 'gear':
      return ['Noted, I’ll fit your sessions around that.', 'Last question, I promise: which shoes do you run in? I’ll keep track of their wear.']
    default:
      return [`Thanks${first ? `, ${first}` : ''}, that was perfect. I have everything I need.`, 'I’m building your plan, it takes a few seconds.']
  }
}

/** Réponse du coureur, résumée en une phrase dans sa bulle. */
function summarize(step: string, a: CompleteAnswers): string {
  const h = a.health
  switch (step) {
    case 'reason':
      return REASONS.find((r) => r.value === a.reason)?.label ?? '—'
    case 'watch':
      return a.has_watch === 'yes' ? 'Yes, a watch' : 'No'
    case 'wearables':
      return (a.wearables ?? []).map((w) => WEARABLES.find((x) => x.id === w)?.name ?? w).join(', ') || '—'
    case 'connect':
      return a.connected?.length ? `${a.connected.map((c) => WEARABLES.find((x) => x.id === c)?.name ?? c).join(', ')} connected` : 'I’ll connect later'
    case 'nowatch':
      return a.data_source === 'strava' ? 'I use Strava' : 'I don’t track my runs'
    case 'strava':
      return a.strava ? `Strava history imported (${a.strava.runs} runs)` : 'I’ll import it later'
    case 'identity': {
      const id = a.identity
      return id ? `${id.firstName} ${id.lastName} · ${id.email}` : '—'
    }
    case 'profile': {
      const parts = [a.utmb ? 'That’s me on UTMB' : null, a.online ? 'These results are mine' : null, a.photoUrl ? 'Use this photo' : null].filter(Boolean)
      return parts.length ? parts.join(' · ') : 'No public profile for me'
    }
    case 'about': {
      const parts = [
        a.city ? `I run in ${a.city}` : null,
        SEXES.find((x) => x.value === a.about?.sex && x.value !== 'x')?.label,
        a.about?.birthYear ? `born in ${a.about.birthYear}` : null,
      ].filter(Boolean)
      return parts.length ? parts.join(' · ') : 'I’d rather skip'
    }
    case 'experience':
      return EXPERIENCES.find((x) => x.value === a.experience)?.label ?? '—'
    case 'days': {
      const d = a.schedule
      return d
        ? `${WEEKDAYS.filter((w) => d.days.includes(w.value))
            .map((w) => w.label)
            .join(', ')}${d.longDay ? ` · long run on ${DAY_NAMES[d.longDay]}` : ''}`
        : '—'
    }
    case 'duration':
      return `${DURATIONS.find((x) => x.value === a.session_max)?.label ?? '—'} per session`
    case 'goal':
      return GOALS.find((x) => x.value === a.goal?.type)?.label ?? '—'
    case 'target': {
      const g = a.goal
      const date = g?.date ? ` · ${new Date(`${g.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
      return g?.race ? `${g.race.name}${date}` : '—'
    }
    case 'estimate':
      return a.estimate?.target ? `Aiming for ${formatDuration(a.estimate.target)}` : 'We’ll see along the way'
    case 'volume':
      return `${h?.weeklyKm ?? 20} km a week`
    case 'pains':
      return h?.pains.length ? `${h.pains.map((p) => PAIN_LABELS[p] ?? p).join(', ')}${h.painLevel ? ` · ${['', 'mild', 'bothersome', 'moderate', 'strong', 'very strong'][h.painLevel]} pain` : ''}` : 'No pain'
    case 'events': {
      const ev = (h?.events ?? []).map((e) => EVENTS.find((x) => x.value === e)?.label ?? e)
      return [ev.length ? ev.join(', ') : 'Nothing in particular', h?.notes.trim()].filter(Boolean).join(' · ')
    }
    case 'gear': {
      const g = a.gear
      return g?.brand ? `${g.brand}${g.model ? ` ${g.model}` : ''} · ${g.shoeKm} km` : 'No shoes entered'
    }
    default:
      return ''
  }
}

/** Champs à plat attendus par la demande de plan (distance, date, volume). */
function withPlanFields(a: CompleteAnswers): CompleteAnswers {
  const race = a.goal?.race
  return {
    ...a,
    distance: race ? distanceCategory(race.km, race.elevation) : a.distance,
    race_date: a.goal?.date ?? null,
    weekly_km: a.health?.weeklyKm,
    days: a.schedule?.days ?? a.days,
    level: EXPERIENCES.find((e) => e.value === a.experience)?.level ?? a.level,
    city: a.city?.trim() || undefined,
  }
}

// ---------- 1. Motivation ----------

// ---------- 2. Montres ----------

function WearablesStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const value = answers.wearables ?? []
  const onChange = (wearables: string[]) => patch({ wearables })
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id))
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {WEARABLES.map((w) => (
          <label
            key={w.id}
            className={`flex items-center gap-3 rounded-[20px] border p-4 ${w.available ? 'cursor-pointer bg-card' : 'opacity-50'} ${value.includes(w.id) ? 'border-primary' : ''}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border bg-background">
              {w.logo ? (
                <img src={w.logo} alt="" className={`size-full object-contain ${w.invert ? 'p-2 invert' : w.logo.endsWith('.svg') ? 'p-1.5' : ''}`} />
              ) : (
                <WatchIcon className="size-5 text-muted-foreground" />
              )}
            </span>
            <span className="flex-1 text-sm">{w.available ? w.name : `${w.name} · coming soon`}</span>
            <Checkbox aria-label={w.name} disabled={!w.available} checked={value.includes(w.id)} onCheckedChange={(c) => toggle(w.id, c === true)} />
          </label>
        ))}
      </div>
    </>
  )
}

/**
 * Strava limite le nombre de coureurs connectables par application : on propose de connecter la montre
 * directement, ou d'importer l'export du compte Strava (lu dans le navigateur), et une liste d'attente.
 */
function StravaImport({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const st = answers.strava
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Strava limits how many runners an app can connect, so we use your account export instead. It’s read in your browser and only a summary (volume, long runs, best
        times) is sent.
      </p>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          <a href="https://www.strava.com/athlete/download_my_account" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
            Request your archive on Strava <ExternalLinkIcon className="size-3.5" />
          </a>
        </li>
        <li>Strava emails you a download link when it’s ready.</li>
        <li>Drop the ZIP here, no need to unzip it.</li>
      </ol>
      <FileDropzone
        accept=".zip,application/zip"
        multiple={false}
        maxFiles={1}
        label="Drop your Strava export (ZIP)"
        description="or choose the file on your device"
        dropLabel="Drop the ZIP here"
        note="Read in your browser, nothing is uploaded"
        onUpload={async (item, { onProgress }) => {
          if (!item.file) throw new Error('File not found')
          const summary = await readStravaExport(item.file, onProgress)
          if (!summary.runs) throw new Error('No runs found in this export.')
          onProgress(100)
          patch({ strava: summary })
        }}
      />
      {st && (
        <div className="grid grid-cols-3 gap-2 rounded-[20px] border bg-background p-4 text-center">
          <div>
            <p className="font-semibold text-xl tabular-nums">{st.runs}</p>
            <p className="text-muted-foreground text-xs">runs</p>
          </div>
          <div>
            <p className="font-semibold text-xl tabular-nums">{st.recent.weeklyKm} km</p>
            <p className="text-muted-foreground text-xs">per week (12 wks)</p>
          </div>
          <div>
            <p className="font-semibold text-xl tabular-nums">{st.recent.longestKm} km</p>
            <p className="text-muted-foreground text-xs">longest run</p>
          </div>
        </div>
      )}
      <p className="text-muted-foreground text-xs">Haven’t received the archive yet? Answer “Later”, you can import it from your account.</p>
    </div>
  )
}

/** Connexion des montres : COROS par OAuth dans une nouvelle fenêtre, Garmin par la clé Personal API collée ici. */
function ConnectStep({ answers, patch, sessionId, guideOpen }: StepProps & { sessionId: string | null; guideOpen?: boolean }) {
  const w = answers.wearables ?? []
  const connected = answers.connected ?? []
  const [opening, setOpening] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [garminOpen, setGarminOpen] = useState(!!guideOpen)
  const [garminPending, setGarminPending] = useState(false)
  const [garminError, setGarminError] = useState('')

  async function connectGarmin(apiKey: string, expiryDays: GarminExpiry) {
    if (!sessionId) return
    setGarminError('')
    setGarminPending(true)
    try {
      await connectGarminOnboarding(sessionId, apiKey, expiryDays)
      patch({ connected: [...new Set([...(answers.connected ?? []), 'garmin'])] })
      setGarminOpen(false)
    } catch (e) {
      setGarminError(e instanceof Error ? e.message : String(e))
    } finally {
      setGarminPending(false)
    }
  }

  // Pendant que la fenêtre COROS est ouverte, on demande au serveur si la connexion a abouti.
  useEffect(() => {
    if (!waiting || !sessionId) return
    const t = window.setInterval(async () => {
      const res = await api<{ providers: string[] }>(`/connect/status?session=${sessionId}`).catch(() => null)
      if (res?.providers.includes('coros')) {
        patch({ connected: [...new Set([...connected, 'coros'])] })
        setWaiting(false)
      }
    }, 2000)
    const stop = window.setTimeout(() => setWaiting(false), 10 * 60_000)
    return () => {
      window.clearInterval(t)
      window.clearTimeout(stop)
    }
  }, [waiting, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function connectCoros() {
    if (!sessionId) return
    setError('')
    setOpening(true)
    // Fenêtre ouverte tout de suite (sinon bloquée par le navigateur), adresse COROS chargée ensuite.
    const win = window.open('', 'coros-connect', 'width=520,height=720')
    try {
      const { url } = await api<{ url: string }>('/connect/coros/start', { body: { sessionId } })
      if (win) win.location.href = url
      else window.open(url, '_blank')
      setWaiting(true)
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {w
        .filter((id) => id === 'coros' || id === 'garmin')
        .map((id) => {
          const meta = WEARABLES.find((x) => x.id === id)!
          const done = connected.includes(id)
          return (
            <div key={id} className="flex flex-col gap-4 rounded-[20px] border bg-background p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border bg-card">
                <img src={meta.logo} alt="" className={`size-full object-contain ${meta.invert ? 'p-2 invert' : ''}`} />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-sm">{meta.name}</span>
                <span className="text-muted-foreground text-xs">
                  {done
                    ? 'Connected: reading your history'
                    : id === 'garmin'
                      ? 'Paste a Personal API key from Garmin Connect'
                      : waiting
                        ? 'Finish connecting in the COROS window…'
                        : 'Allow Raice.run to read your workouts'}
                </span>
              </span>
              {done ? (
                <Badge tone="success">
                  <CheckIcon className="size-3.5" /> Connected
                </Badge>
              ) : id === 'coros' ? (
                <Button type="button" variant={waiting ? 'secondary' : undefined} loading={opening || waiting} disabled={!sessionId} onClick={() => void connectCoros()}>
                  {waiting ? 'Waiting' : 'Connect'}
                </Button>
              ) : (
                <Button type="button" variant={garminOpen ? 'secondary' : undefined} disabled={!sessionId} onClick={() => setGarminOpen((o) => !o)}>
                  {garminOpen ? 'Close' : 'Connect'}
                </Button>
              )}
            </div>
            {id === 'garmin' && !done && garminOpen && (
              <div className="border-t pt-4">
                <GarminKeyForm pending={garminPending} error={garminError} onSubmit={(apiKey, expiryDays) => void connectGarmin(apiKey, expiryDays)} />
              </div>
            )}
            </div>
          )
        })}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

// ---------- 3. Identité + profil UTMB ----------

function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

type Person = { firstName: string; lastName: string; email: string }

/** Photo Gravatar de l'e-mail (sans photo : `url: null`). */
const gravatarQuery = (email: string) => ({
  queryKey: ['gravatar', email],
  queryFn: () => api<{ url: string | null }>(`/lookup/gravatar?email=${encodeURIComponent(email)}`),
  staleTime: Infinity,
  retry: false,
})

/** Recherche en ligne des résultats publics (lente : jusqu'à ~90 s côté serveur). `profile: null` quand elle n'a rien donné. */
const webProfileQuery = (sessionId: string, p: Person) => ({
  queryKey: ['web-profile', p.email, p.firstName.toLowerCase(), p.lastName.toLowerCase()],
  queryFn: () => api<{ profile: WebProfile | null }>('/lookup/web-profile', { body: { sessionId, ...p } }),
  staleTime: Infinity,
  retry: false,
})

function IdentityStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const id = answers.identity ?? { firstName: '', lastName: '', email: '' }
  const set = (p: Partial<typeof id>) => patch({ identity: { ...id, ...p } })
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="First name" autoComplete="given-name" value={id.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        <Input label="Last name" autoComplete="family-name" value={id.lastName} onChange={(e) => set({ lastName: e.target.value })} />
      </div>
      <Input label="Email" type="email" autoComplete="email" placeholder="name@example.com" value={id.email} onChange={(e) => set({ email: e.target.value })} />
      <p className="text-muted-foreground text-xs">I’ll use them to save your plan and to look for your public race results.</p>
    </>
  )
}

// ---------- Profil public : UTMB, résultats en ligne, photo ----------

function ProfileStep({ answers, patch, sessionId }: StepProps & { sessionId: string | null }) {
  const id = answers.identity ?? { firstName: '', lastName: '', email: '' }
  const person: Person = { firstName: id.firstName.trim(), lastName: id.lastName.trim(), email: id.email.trim().toLowerCase() }
  const fullName = `${person.firstName} ${person.lastName}`.trim()
  const qc = useQueryClient()
  const canSearch = person.firstName.length >= 2 && person.lastName.length >= 2
  const runners = useQuery({
    queryKey: ['utmb', 'runners', fullName],
    // Un temps de recherche minimal : le résultat ne surgit pas d'un coup.
    queryFn: () => Promise.all([api<UtmbRunner[]>(`/lookup/utmb/runners?q=${encodeURIComponent(fullName)}`), new Promise((r) => window.setTimeout(r, 1400))]).then(([r]) => r),
    enabled: canSearch,
    staleTime: Infinity,
  })
  const gravatar = useQuery({ ...gravatarQuery(person.email), enabled: !!person.email })
  const web = useQuery({ ...webProfileQuery(sessionId ?? '', person), enabled: !!sessionId && canSearch && !!person.email })

  function pick(uri: string) {
    if (uri === 'none') return patch({ utmb: null })
    const r = runners.data?.find((x) => x.uri === uri)
    patch({ utmb: r ? { uri: r.uri, name: r.name, index: r.index } : null })
    // Chargement en arrière-plan des résultats pendant la suite du questionnaire.
    void qc.prefetchQuery({
      queryKey: ['utmb', 'runner', uri],
      queryFn: () => api<UtmbProfile>(`/lookup/utmb/runner/${uri}`),
      staleTime: Infinity,
    })
  }

  // Photos candidates : jamais utilisées sans un « C'est moi » explicite.
  const utmbPick = runners.data?.find((r) => r.uri === answers.utmb?.uri)
  const photos = [
    gravatar.data?.url ? { url: gravatar.data.url, source: 'Gravatar' } : null,
    utmbPick?.picture ? { url: utmbPick.picture, source: 'UTMB' } : null,
    ...(web.data?.profile?.photos ?? []).map((p) => ({ url: p.url, source: p.source })),
  ].filter((p, i, all): p is { url: string; source: string } => !!p && all.findIndex((x) => x?.url === p.url) === i)
  const profile = web.data?.profile
  const online = profile?.found ? profile : null

  return (
    <>
      {runners.isFetching ? (
        <div className="flex flex-col gap-3">
          <TextShimmer as="p" className="text-sm">
            Looking for your UTMB profile…
          </TextShimmer>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="aspect-square animate-skeleton rounded-[18px] bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        </div>
      ) : (
        runners.data &&
        runners.data.length > 0 && <UtmbPicker runners={runners.data.slice(0, 6)} value={answers.utmb?.uri ?? (answers.utmb === null ? 'none' : null)} onPick={pick} />
      )}

      {web.isFetching ? (
        <TextShimmer as="p" className="text-sm">
          Searching results sites (ITRA, Betrail, FFA, DUV…). You can carry on, it’s optional.
        </TextShimmer>
      ) : (
        online && (
          <OnlineResults
            profile={online}
            value={answers.online === undefined ? null : !!answers.online}
            onPick={(mine) => patch({ online: mine ? { summary: online.summary, sources: online.sources, results: online.results } : null })}
          />
        )
      )}

      {photos.length > 0 && <PhotoPicker photos={photos} name={fullName} value={answers.photoUrl} onPick={(photoUrl) => patch({ photoUrl })} />}

      {!runners.isFetching && !web.isFetching && !runners.data?.length && !online && photos.length === 0 && (
        <p className="text-muted-foreground text-sm">I didn’t find any public profile under your name. No problem, we’ll go from your answers.</p>
      )}
      <p className="text-muted-foreground text-xs">Road runner? You can also add a recent time at the estimate step.</p>
    </>
  )
}

/** Résultats trouvés en ligne : la personne confirme qu'il s'agit bien d'elle. */
function OnlineResults({ profile, value, onPick }: { profile: WebProfile; value: boolean | null; onPick: (mine: boolean) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border bg-background p-4">
      <div className="flex items-center gap-2">
        <CompassIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">Are these your results?</span>
      </div>
      {profile.summary && <p className="text-muted-foreground text-sm">{profile.summary}</p>}
      {profile.results.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {profile.results.slice(0, 5).map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                {r.race}
                {r.distance ? <span className="text-muted-foreground"> · {r.distance}</span> : null}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">{[r.time, r.rank, r.date?.slice(0, 4)].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      {profile.sources.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {profile.sources.map((src) => (
            <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2 hover:text-foreground">
              {src.site || new URL(src.url).hostname} <ExternalLinkIcon className="size-3" />
            </a>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={value === true ? undefined : 'secondary'} onClick={() => onPick(true)}>
          {value === true && <CheckIcon className="size-4" />} That’s me
        </Button>
        <Button type="button" size="sm" variant={value === false ? undefined : 'ghost'} onClick={() => onPick(false)}>
          Not me
        </Button>
      </div>
    </div>
  )
}

/** Photos trouvées (Gravatar, UTMB, en ligne) : aucune n'est gardée sans confirmation. */
function PhotoPicker({ photos, name, value, onPick }: { photos: { url: string; source: string }[]; name: string; value: string | null | undefined; onPick: (url: string | null) => void }) {
  const [broken, setBroken] = useState<string[]>([])
  const shown = photos.filter((p) => !broken.includes(p.url))
  if (!shown.length) return null
  const ring = (on: boolean) => (on ? 'border-foreground ring-2 ring-foreground/30' : 'border-border hover:border-foreground/50')
  return (
    <div className="flex flex-col gap-3">
      <span className="font-medium text-sm">Is this you? I’ll use it as your profile photo.</span>
      <div className="flex flex-wrap gap-3">
        {shown.map((p) => (
          <button
            key={p.url}
            type="button"
            aria-pressed={value === p.url}
            aria-label={`Use the ${p.source} photo`}
            onClick={() => onPick(p.url)}
            className="flex flex-col items-center gap-1.5"
          >
            <span className={`relative block size-20 overflow-hidden rounded-full border transition-all ${ring(value === p.url)}`}>
              <img src={p.url} alt={`${name}, ${p.source}`} className="size-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken((b) => [...b, p.url])} />
              {value === p.url && (
                <span className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-white text-black">
                  <CheckIcon className="size-3" />
                </span>
              )}
            </span>
            <span className="text-muted-foreground text-xs">{p.source}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onPick(null)}
        className={`rounded-[18px] border border-dashed p-3 text-muted-foreground text-sm transition-all ${value === null ? 'border-foreground text-foreground' : 'hover:text-foreground'}`}
      >
        None of these is me
      </button>
    </div>
  )
}

/** Profils UTMB : carte carrée avec photo quand il y en a une, carte en dégradé sinon. */
function UtmbPicker({ runners, value, onPick }: { runners: UtmbRunner[]; value: string | null; onPick: (uri: string) => void }) {
  const withPhoto = runners.filter((r) => r.picture)
  const without = runners.filter((r) => !r.picture)
  const ring = (on: boolean) => (on ? 'border-foreground ring-2 ring-foreground/30' : 'border-border hover:border-foreground/50')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MountainIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">Is this you on UTMB?</span>
      </div>
      {withPhoto.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {withPhoto.map((r) => (
            <button
              key={r.uri}
              type="button"
              aria-pressed={value === r.uri}
              onClick={() => onPick(r.uri)}
              className={`relative aspect-square overflow-hidden rounded-[18px] border text-left transition-all ${ring(value === r.uri)}`}
            >
              <img src={r.picture!} alt="" className="absolute inset-0 size-full object-cover" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3 text-white">
                <span className="font-medium text-sm leading-tight">{r.name}</span>
                <span className="text-[11px] text-white/70">
                  {r.nationality} · {r.ageGroup}
                  {r.index ? ` · Index ${r.index}` : ''}
                </span>
              </span>
              {value === r.uri && (
                <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-white text-black">
                  <CheckIcon className="size-3.5" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {without.map((r) => (
        <button
          key={r.uri}
          type="button"
          aria-pressed={value === r.uri}
          onClick={() => onPick(r.uri)}
          className={`flex items-center gap-3 rounded-[18px] border bg-gradient-to-br from-foreground/[0.09] via-foreground/[0.03] to-transparent p-4 text-left transition-all ${ring(value === r.uri)}`}
        >
          <Avatar name={r.name} size="sm" />
          <span className="flex flex-1 flex-col">
            <span className="font-medium text-sm">{r.name}</span>
            <span className="text-muted-foreground text-xs">
              {r.nationality} · {r.ageGroup}
            </span>
          </span>
          {r.index ? <Badge size="sm">Index {r.index}</Badge> : null}
          {value === r.uri && <CheckIcon className="size-4" />}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={value === 'none'}
        onClick={() => onPick('none')}
        className={`rounded-[18px] border border-dashed p-3 text-muted-foreground text-sm transition-all ${value === 'none' ? 'border-foreground text-foreground' : 'hover:text-foreground'}`}
      >
        That’s not me
      </button>
    </div>
  )
}

// ---------- À propos et disponibilités ----------

function AboutStep({ answers, patch }: StepProps) {
  const ab = answers.about ?? { sex: null, birthYear: null }
  const set = (p: Partial<typeof ab>) => patch({ about: { ...ab, ...p } })
  const year = new Date().getFullYear()
  const [yearText, setYearText] = useState('')
  const preset = CITIES.includes(answers.city ?? '')
  const [other, setOther] = useState(!!answers.city && !preset)
  return (
    <>
      <ChipGroup
        label="City you run in"
        multiple={false}
        options={[...CITIES.map((c) => ({ value: c, label: c })), { value: OTHER_CITY, label: 'Other' }]}
        value={other ? [OTHER_CITY] : answers.city ? [answers.city] : []}
        onValueChange={([v]) => {
          setOther(v === OTHER_CITY)
          patch({ city: v && v !== OTHER_CITY ? v : '' })
        }}
      />
      {other && <Input label="Your city" autoComplete="address-level2" placeholder="E.g. Montpellier" value={answers.city ?? ''} onChange={(e) => patch({ city: e.target.value })} />}
      <ChipGroup label="Sex" multiple={false} options={SEXES} value={ab.sex ? [ab.sex] : []} onValueChange={([sex]) => set({ sex: sex ?? null })} />
      <Input
        label="Year of birth"
        placeholder="E.g. 1992"
        inputMode="numeric"
        maxLength={4}
        value={ab.birthYear ? String(ab.birthYear) : yearText}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, '')
          setYearText(t)
          const y = Number(t)
          set({
            birthYear: t.length === 4 && y >= year - 90 && y <= year - 12 ? y : null,
          })
        }}
      />
    </>
  )
}

function DaysStep({ answers, patch }: StepProps) {
  const sc = answers.schedule ?? { days: [], longDay: null }
  const set = (p: Partial<typeof sc>) => patch({ schedule: { ...sc, ...p } })
  return (
    <>
      <ChipGroup
        label="Available days"
        options={WEEKDAYS}
        value={sc.days}
        onValueChange={(days) => {
          // Sortie longue par défaut le dernier jour du week-end disponible.
          const longDay = sc.longDay && days.includes(sc.longDay) ? sc.longDay : (['sun', 'sat'].find((d) => days.includes(d)) ?? null)
          set({
            days: WEEKDAYS.map((w) => w.value).filter((d) => days.includes(d)),
            longDay,
          })
        }}
      />
      {sc.days.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm">Long run on</span>
          <ChipGroup
            label="Long run on"
            multiple={false}
            options={WEEKDAYS.filter((w) => sc.days.includes(w.value))}
            value={sc.longDay ? [sc.longDay] : []}
            onValueChange={([longDay]) => set({ longDay: longDay ?? null })}
          />
        </div>
      )}
      {sc.days.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Up to {sc.days.length} session{sc.days.length > 1 ? 's' : ''} a week.
        </p>
      )}
    </>
  )
}

// ---------- 4. Objectif ----------

const GOALS = [
  {
    value: 'race',
    label: 'Run a race',
    description: 'A date, a distance, a goal.',
    icon: <FlagIcon />,
  },
  {
    value: 'train',
    label: 'Train regularly',
    description: 'No race in sight for now.',
    icon: <ActivityIcon />,
  },
  {
    value: 'distance',
    label: 'Run a distance',
    description: 'My first 10K, half or marathon.',
    icon: <CompassIcon />,
  },
]

/** Filtre de distance, avant la recherche : catégories classiques sur route, tranches de longueur en trail. */
const DIST_FILTERS = {
  road: [
    { value: '5k', label: '5 km' },
    { value: '10k', label: '10 km' },
    { value: 'half', label: 'Half' },
    { value: 'marathon', label: 'Marathon' },
  ],
  trail: [
    { value: 'trail-short', label: '< 30 km' },
    { value: 'trail-mid', label: '30–60 km' },
    { value: 'trail-long', label: '60–100 km' },
    { value: 'ultra', label: '100 km +' },
  ],
}

const RACES_PAGE = 4

function TargetStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const goal = answers.goal ?? {
    type: 'race',
    terrain: 'road' as const,
    race: null,
    date: null,
  }
  const set = (p: Partial<typeof goal>) => patch({ goal: { ...goal, ...p } })
  const [q, setQ] = useState('')
  const [dist, setDist] = useState('')
  const query = useDebounced(q, 300)
  // Nombre de courses affichées, remis à zéro quand le filtre ou la recherche change.
  const [page, setPage] = useState({ key: '', n: RACES_PAGE })
  const pageKey = `${dist}|${query}`
  const shown = page.key === pageKey ? page.n : RACES_PAGE
  // Le trail est fermé pour l'instant : recherche sur route uniquement.
  const races = useQuery({
    queryKey: ['races', 'road', dist, query],
    queryFn: () => api<Race[]>(`/lookup/races?type=road&dist=${dist}&q=${encodeURIComponent(query)}`),
    enabled: goal.type === 'race',
    staleTime: 600_000,
  })
  const [custom, setCustom] = useState(false)
  const [customRace, setCustomRace] = useState({
    name: '',
    km: 10,
    elevation: 0,
  })

  if (goal.type === 'distance')
    return (
      <ChipGroup
        label="Distance"
        multiple={false}
        options={MANUAL_DISTANCES}
        value={goal.race ? [String(goal.race.km)] : []}
        onValueChange={([v]) =>
          set({
            race: v
              ? {
                  id: `distance:${v}`,
                  name: MANUAL_DISTANCES.find((d) => d.value === v)!.label,
                  detail: 'Target distance',
                  km: Number(v),
                  elevation: 0,
                  date: null,
                  source: 'saisie',
                }
              : null,
          })
        }
      />
    )

  const list = races.data ?? []
  const more = list.length > shown
  return (
    <div className="flex flex-col gap-4">
      {!custom ? (
        <>
          <ChipGroup label="Distance" multiple={false} options={DIST_FILTERS.road} value={dist ? [dist] : []} onValueChange={([v]) => setDist(v ?? '')} />
          <SearchField label="Search for a race" placeholder="E.g. Paris Marathon" value={q} onValueChange={setQ} />
          {list.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <RadioCards
                  aria-label="Race"
                  layout="list"
                  value={goal.race?.id ?? null}
                  onValueChange={(id) => set({ race: list.find((r) => r.id === id) ?? null })}
                  options={list.slice(0, shown).map((r) => ({
                    value: r.id,
                    label: r.name,
                    description: r.detail,
                    meta: r.date ? <span className="text-muted-foreground text-xs">{r.date}</span> : undefined,
                  }))}
                />
                {more && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent" />}
              </div>
              {more && (
                <Button type="button" variant="ghost" size="sm" className="self-center" onClick={() => setPage({ key: pageKey, n: shown + 6 })}>
                  Show more ({list.length - shown}) <ChevronDownIcon className="size-4" />
                </Button>
              )}
            </div>
          ) : (
            races.isFetched && <EmptyState title="No races found" description="Try another name, or enter your race." />
          )}
          <Button type="button" variant="secondary" onClick={() => setCustom(true)}>
            <PlusIcon className="size-4" /> My race isn’t in the list
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-4 rounded-[20px] border bg-background p-4">
          <Input label="Race name" value={customRace.name} onChange={(e) => setCustomRace({ ...customRace, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Distance" value={customRace.km} min={1} max={250} suffix=" km" locale="en-GB" onValueChange={(km) => setCustomRace({ ...customRace, km })} />
            <NumberField
              label="Elevation gain"
              value={customRace.elevation}
              min={0}
              max={12000}
              step={50}
              suffix=" m"
              locale="en-GB"
              onValueChange={(elevation) => setCustomRace({ ...customRace, elevation })}
            />
          </div>
          <Button
            type="button"
            disabled={!customRace.name.trim()}
            onClick={() => {
              set({
                race: {
                  id: 'saisie',
                  name: customRace.name.trim(),
                  detail: `${customRace.km} km · ${customRace.elevation} m D+`,
                  km: customRace.km,
                  elevation: customRace.elevation,
                  date: null,
                  source: 'saisie',
                },
              })
              setCustom(false)
            }}
          >
            Use this race
          </Button>
        </div>
      )}
      {goal.race && (
        <p className="text-sm">
          Selected race: <strong className="font-medium">{goal.race.name}</strong> · {goal.race.detail}
        </p>
      )}
      <DatePicker
        label="Race date"
        locale="en-GB"
        placeholder="Pick the date"
        minDate={new Date()}
        value={goal.date ? new Date(`${goal.date}T12:00:00`) : undefined}
        onChange={(d) =>
          set({
            date: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null,
          })
        }
      />
    </div>
  )
}

/** Réponse « rien à signaler », envoyée d'un clic sans remplir le formulaire. */
const NOTHING: Record<string, { label: string; answer: (a: CompleteAnswers) => Partial<CompleteAnswers> }> = {
  pains: { label: 'No issues', answer: (a) => ({ health: { ...defaultHealth(a), pains: [], painLevel: 0 } }) },
  events: { label: 'Nothing in particular', answer: (a) => ({ health: { ...defaultHealth(a), events: [], notes: '' } }) },
}

/** Questions à choix unique : réponses rapides envoyées dès le clic. */
const QUICK: Record<
  string,
  {
    options: { value: string; label: string; icon?: React.ReactNode }[]
    answer: (value: string) => Partial<CompleteAnswers>
  }
> = {
  reason: { options: REASONS, answer: (reason) => ({ reason }) },
  watch: {
    options: [
      { value: 'yes', label: 'Yes, a watch', icon: <WatchIcon /> },
      { value: 'no', label: 'No', icon: <ActivityIcon /> },
    ],
    answer: (v) => ({ has_watch: v as 'yes' | 'no', ...(v === 'no' ? { wearables: [] } : { data_source: undefined }) }),
  },
  nowatch: {
    options: [
      { value: 'strava', label: 'I use Strava', icon: <img src="/partners/strava.png" alt="" className="size-4 rounded-[4px]" /> },
      { value: 'none', label: 'I don’t track my runs', icon: <FootprintsIcon /> },
    ],
    answer: (v) => ({ data_source: v as 'strava' | 'none', ...(v === 'none' ? { strava: null } : {}) }),
  },
  experience: {
    options: EXPERIENCES,
    answer: (experience) => ({ experience }),
  },
  goal: {
    options: GOALS,
    answer: (type) => ({
      goal: { type, terrain: 'road', race: null, date: null },
    }),
  },
  duration: { options: DURATIONS, answer: (session_max) => ({ session_max }) },
}

// ---------- 5. Estimation ----------

function EstimateStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const uri = answers.utmb?.uri
  const profile = useQuery({
    queryKey: ['utmb', 'runner', uri],
    queryFn: () => api<UtmbProfile>(`/lookup/utmb/runner/${uri}`),
    enabled: !!uri,
    staleTime: Infinity,
  })
  const manual = (answers.performances ?? []).filter((p) => p.source === 'manuel')
  const utmbPerfs: Performance[] = useMemo(
    () =>
      (profile.data?.results ?? [])
        .map((r) => ({
          label: r.race,
          km: r.km,
          elevation: r.elevation,
          seconds: parseDuration(r.time) ?? 0,
          date: r.date,
          source: 'utmb' as const,
        }))
        .filter((p) => p.seconds > 0),
    [profile.data],
  )
  const watchPerfs = useMemo(() => watchPerformances(answers.watch_insights), [answers.watch_insights])
  const perfs = [...manual, ...(answers.strava?.performances ?? []), ...watchPerfs, ...utmbPerfs]
  const race = answers.goal?.race
  const prediction = race ? predict(perfs, race.km, race.elevation) : null
  const target = answers.estimate?.target ?? prediction?.seconds ?? null

  useEffect(() => {
    if (prediction && answers.estimate?.predicted !== Math.round(prediction.seconds)) {
      patch({
        estimate: {
          predicted: Math.round(prediction.seconds),
          target: answers.estimate?.target ?? Math.round(prediction.seconds),
        },
      })
    }
  }, [prediction?.seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState({ km: '10', time: '' })
  const addManual = () => {
    const seconds = parseDuration(draft.time)
    if (!seconds) return
    const km = Number(draft.km)
    patch({
      performances: [
        ...(answers.performances ?? []),
        {
          label: `Recent ${MANUAL_DISTANCES.find((d) => d.value === draft.km)?.label}`,
          km,
          elevation: 0,
          seconds,
          source: 'manuel',
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    })
    setDraft({ ...draft, time: '' })
  }

  return (
    <>
      {uri && profile.isPending && (
        <TextShimmer as="p" className="text-sm">
          Reading your UTMB results…
        </TextShimmer>
      )}

      {race && prediction && target && (
        <div className="flex flex-col gap-6 rounded-[26px] border bg-background p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-sm">Target time</p>
              <p className="font-semibold text-5xl tabular-nums tracking-tight">{formatDuration(target)}</p>
              <p className="mt-2 text-muted-foreground text-sm">
                {formatPace(target, race.km)} · estimate {formatDuration(prediction.seconds)}
              </p>
            </div>
            <Badge tone={target < prediction.seconds * 0.97 ? 'warning' : 'success'}>{target < prediction.seconds * 0.97 ? 'Ambitious' : 'Realistic'}</Badge>
          </div>
          <RulerSlider
            label="Adjust your target time"
            min={Math.round((prediction.seconds * 0.85) / 60) * 60}
            max={Math.round((prediction.seconds * 1.2) / 60) * 60}
            step={60}
            majorEvery={10}
            value={Math.round(target / 60) * 60}
            onValueChange={(v) =>
              patch({
                estimate: {
                  predicted: Math.round(prediction.seconds),
                  target: v,
                },
              })
            }
            format={formatDuration}
          />
          <p className="text-muted-foreground text-xs">Based on: {prediction.basedOn.map((p) => `${p.label} (${formatDuration(p.seconds)})`).join(' · ')}</p>
        </div>
      )}

      {race && !prediction && !profile.isPending && (
        <EmptyState title="Not enough data yet" description="Add a recent time below to get an estimate." />
      )}

      {answers.watch_insights && watchPerfs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[26px] border p-5">
          <span className="font-medium text-sm">Best times on your {watchName(answers.watch_insights)}</span>
          {answers.watch_insights.bests.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-sm">
              <span>{b.label === 'Half' ? 'Half marathon' : b.label}</span>
              <span className="text-muted-foreground tabular-nums">
                <span className="text-foreground">{formatDuration(b.seconds)}</span>
                {b.date ? ` · ${new Date(`${b.date}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-[26px] border p-5">
        <span className="font-medium text-sm">Add a recent time</span>
        <ChipGroup label="Distance" multiple={false} options={MANUAL_DISTANCES} value={[draft.km]} onValueChange={([v]) => v && setDraft({ ...draft, km: v })} />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input label="Time" placeholder="e.g. 48:30 or 1:45:00" inputMode="numeric" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          </div>
          <Button type="button" variant="secondary" disabled={!parseDuration(draft.time)} onClick={addManual}>
            Add
          </Button>
        </div>
        {manual.map((p, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span>
              {p.label} · <span className="tabular-nums">{formatDuration(p.seconds)}</span>
            </span>
            <button
              type="button"
              aria-label="Remove this time"
              className="text-muted-foreground hover:text-foreground"
              onClick={() =>
                patch({
                  performances: (answers.performances ?? []).filter((x) => x !== p),
                  estimate: { predicted: null, target: null },
                })
              }
            >
              <TrashIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- 6. Santé ----------

function defaultHealth(a: CompleteAnswers): NonNullable<CompleteAnswers['health']> {
  return (
    a.health ?? {
      pains: [],
      painLevel: 0,
      events: [],
      weeklyKm: a.strava?.recent.runs ? a.strava.recent.weeklyKm : (a.watch_insights?.weeklyKm ?? 20),
      notes: '',
    }
  )
}

/** Réponses tirées de la montre, seulement quand la personne n'a pas encore répondu (elle peut toujours les changer). */
function watchPrefill(a: CompleteAnswers, w: WatchInsights): Partial<CompleteAnswers> {
  const prefilled = new Set(a.watch_prefilled ?? [])
  const out: Partial<CompleteAnswers> = { watch_insights: w }
  if (!a.health && w.weeklyKm !== null) {
    out.health = { ...defaultHealth({ ...a, watch_insights: w }), weeklyKm: w.weeklyKm }
    prefilled.add('weekly_km')
  }
  if (!a.schedule && w.usualDays?.length) {
    out.schedule = { days: w.usualDays, longDay: w.longRunDay && w.usualDays.includes(w.longRunDay) ? w.longRunDay : null }
    prefilled.add('days')
  }
  out.watch_prefilled = [...prefilled]
  return out
}

/** « Tue, Thu and Sun » */
function listDays(days: string[]) {
  const names = WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.label)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
}

function useHealth({ answers, patch }: StepProps) {
  const h = defaultHealth(answers)
  return [h, (p: Partial<typeof h>) => patch({ health: { ...h, ...p } })] as const
}

function VolumeStep(props: StepProps) {
  const [h, set] = useHealth(props)
  // Enregistre la valeur par défaut, pour qu'un envoi direct garde bien 20 km.
  useEffect(() => {
    if (!props.answers.health) set({})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <NumberField label="Kilometres per week right now" value={h.weeklyKm} min={0} max={200} suffix=" km" locale="en-GB" onValueChange={(weeklyKm) => set({ weeklyKm })} />
  )
}

function PainsStep(props: StepProps) {
  const [h, set] = useHealth(props)
  return (
    <>
      <ChipGroup label="Painful areas" options={PAINS} value={h.pains} onValueChange={(pains) => set({ pains, painLevel: pains.length ? h.painLevel : 0 })} />
      {h.pains.length > 0 && (
        <Rating
          label="Pain intensity"
          max={5}
          value={h.painLevel}
          onChange={(painLevel) => set({ painLevel })}
          valueLabels={['Mild', 'Bothersome', 'Moderate', 'Strong', 'Very strong']}
          emptyLabel="Not set"
        />
      )}
      {h.painLevel >= 4 && <DoctorNote />}
    </>
  )
}

function EventsStep(props: StepProps) {
  const [h, set] = useHealth(props)
  return (
    <>
      <ChipGroup label="In the last few months" options={EVENTS} value={h.events} onValueChange={(events) => set({ events })} />
      <Textarea
        label="Anything else? (optional)"
        placeholder="E.g. sprained ankle in March, easing back in"
        rows={3}
        value={h.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />
      {h.events.includes('surgery') && <DoctorNote />}
    </>
  )
}

function DoctorNote() {
  return (
    <p className="rounded-[20px] border border-[var(--warning)] p-4 text-sm">
      With strong pain or recent surgery, check with a doctor before getting back to training. Your plan will start very gradually.
    </p>
  )
}

// ---------- 7. Matériel ----------

function GearStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const g = answers.gear ?? {
    brand: null,
    model: '',
    shoeKm: 200,
    rotation: false,
  }
  const set = (p: Partial<typeof g>) => patch({ gear: { ...g, ...p } })
  const brands = useQuery({
    queryKey: ['shoe-brands'],
    queryFn: () => api<string[]>('/lookup/shoe-brands'),
    staleTime: Infinity,
  })
  const shoes = useQuery({
    queryKey: ['shoes'],
    queryFn: () => api<Shoe[]>('/lookup/shoes'),
    staleTime: Infinity,
  })
  // Quelques modèles connus de la marque, en exemple dans le champ libre.
  const examples = (shoes.data ?? [])
    .filter((s) => s.brand === g.brand)
    .slice(0, 3)
    .map((s) => s.model)
  return (
    <>
      <Combobox
        label="Brand"
        placeholder="Search for a brand"
        emptyMessage="Brand not found"
        options={(brands.data ?? []).map((b) => ({ value: b, label: b }))}
        value={g.brand ?? undefined}
        onValueChange={(brand) => set({ brand })}
      />
      <Input label="Model" placeholder={examples.length ? `E.g. ${examples.join(', ')}` : 'E.g. Pegasus 41'} value={g.model} onChange={(e) => set({ model: e.target.value })} />
      <NumberField
        label="Kilometres already run in them"
        value={g.shoeKm}
        min={0}
        max={2000}
        step={10}
        largeStep={50}
        suffix=" km"
        locale="en-GB"
        onValueChange={(shoeKm) => set({ shoeKm })}
      />
      <Switch label="I rotate with another pair" checked={g.rotation} onCheckedChange={(rotation) => set({ rotation })} />
      {g.shoeKm >= 700 && <p className="text-muted-foreground text-sm">Past 700 km, cushioning drops off noticeably: think about getting a new pair.</p>}
    </>
  )
}

// ---------- 8. Génération ----------

const BUILD = [
  { id: 'history', label: 'Reading your history' },
  { id: 'paces', label: 'Calculating your paces' },
  { id: 'weeks', label: 'Building your weeks' },
  { id: 'sessions', label: 'Placing key sessions' },
  { id: 'load', label: 'Checking training load' },
]

function GenerateStep({ answers, preview, onDone }: { answers: CompleteAnswers; preview: boolean; onDone: () => Promise<void> }) {
  const [current, setCurrent] = useState(0)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    if (current >= BUILD.length) {
      void onDone().then(() => setFinished(true))
      return
    }
    const t = window.setTimeout(() => setCurrent((c) => c + 1), 1400)
    return () => window.clearTimeout(t)
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-8">
      <div className="relative -mx-5 -mt-5 h-48 overflow-hidden rounded-t-[26px] sm:h-60">
        <img src="/visuals/shoes.webp" alt="" className="absolute inset-0 size-full object-cover object-[60%_55%]" />
        <div className="absolute inset-0 bg-linear-to-t from-card to-transparent" />
      </div>
      <Progress value={Math.min(current, BUILD.length)} max={BUILD.length} label={finished ? 'Done' : BUILD[Math.min(current, BUILD.length - 1)].label} showValue />
      <Stepper steps={BUILD} current={current} orientation="vertical" details="current" label="Plan generation" completeLabel="Plan ready" />
      {!finished && <TextShimmer as="p" className="text-muted-foreground text-sm">{`${BUILD[Math.min(current, BUILD.length - 1)].label}…`}</TextShimmer>}
      {finished && preview && <pre className="max-h-72 overflow-auto rounded-[20px] border bg-card p-4 text-xs">{JSON.stringify(answers, null, 2)}</pre>}
    </div>
  )
}
