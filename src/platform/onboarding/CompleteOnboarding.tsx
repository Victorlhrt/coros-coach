import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ActivityIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
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
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog'
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
import { CoachAvatar } from './CoachAvatar'
import { readStravaExport, type StravaSummary } from './strava'
import { distanceCategory, formatDuration, formatPace, parseDuration, predict, type Performance } from './estimate'

/**
 * Parcours « Complet » (version de test) : motivation, montre, identité et profil UTMB, objectif et course,
 * estimation de temps, santé, chaussures, puis écran de génération. Tout est construit avec les composants Arc UI.
 */

type Race = { id: string; name: string; detail: string; km: number; elevation: number; date: string | null; source: 'raice' | 'utmb' | 'saisie' }
type UtmbRunner = { uri: string; name: string; ageGroup: string; nationality: string; index: number | null; picture: string | null }
type UtmbProfile = { uri: string; name: string; indexes: { piCategory: string; index: number }[]; results: { date: string; race: string; km: number; elevation: number; time: string | null }[] }
type Shoe = { id: string; brand: string; model: string; use: string }

export type CompleteAnswers = {
  reason?: string
  wearables?: string[]
  identity?: { firstName: string; lastName: string; email: string }
  utmb?: { uri: string; name: string; index?: number | null } | null
  goal?: { type: string; terrain: 'road' | 'trail'; race: Race | null; date: string | null }
  performances?: Performance[]
  estimate?: { predicted: number | null; target: number | null }
  health?: { pains: string[]; painLevel: number; events: string[]; weeklyKm: number; notes: string }
  gear?: { brand: string | null; model: string; shoeKm: number; rotation: boolean }
  // Champs à plat repris par la demande de plan côté serveur.
  distance?: string
  race_date?: string | null
  weekly_km?: number
  strava?: StravaSummary | null
  strava_need?: string
}

const STEPS = [
  { id: 'reason', label: 'Motivation' },
  { id: 'wearables', label: 'Montre' },
  { id: 'identity', label: 'Profil' },
  { id: 'goal', label: 'Objectif' },
  { id: 'target', label: 'Course' },
  { id: 'estimate', label: 'Estimation' },
  { id: 'volume', label: 'Volume' },
  { id: 'pains', label: 'Douleurs' },
  { id: 'events', label: 'Récent' },
  { id: 'gear', label: 'Matériel' },
  { id: 'generate', label: 'Plan' },
]

const REASONS = [
  { value: 'race', label: 'Préparer une course', description: 'J’ai une date et un objectif en tête.', icon: <FlagIcon /> },
  { value: 'progress', label: 'Progresser', description: 'Courir plus vite ou plus longtemps.', icon: <TrendingUpIcon /> },
  { value: 'structure', label: 'Structurer mes sorties', description: 'Arrêter de courir au hasard.', icon: <LayoutListIcon /> },
  { value: 'comeback', label: 'Reprendre', description: 'Après une pause ou une blessure.', icon: <RotateCcwIcon /> },
  { value: 'start', label: 'Commencer la course', description: 'Je débute.', icon: <SproutIcon /> },
]

/** Logos des montres (`invert` pour les marques noires sur fond sombre). Sans logo : icône générique. */
const WEARABLES = [
  { id: 'coros', name: 'COROS', logo: '/partners/coros.png', invert: false, available: true },
  { id: 'garmin', name: 'Garmin', logo: '/partners/garmin.png', invert: true, available: true },
  { id: 'apple', name: 'Apple Watch', logo: '/partners/apple.png', invert: true, available: false },
  { id: 'suunto', name: 'Suunto', logo: '/partners/suunto-mark.svg', available: false },
  { id: 'polar', name: 'Polar', logo: '/partners/polar-mark.svg', available: false },
]

const PAINS = ['Genou', 'Tendon d’Achille', 'Mollet', 'Périostite', 'Ischios', 'Hanche', 'Dos', 'Voûte plantaire', 'Cheville'].map((p) => ({ value: p, label: p }))
const EVENTS = [
  { value: 'injury', label: 'Blessure récente' },
  { value: 'illness', label: 'Maladie' },
  { value: 'break', label: 'Pause de plus d’un mois' },
  { value: 'pregnancy', label: 'Grossesse ou post-partum' },
  { value: 'surgery', label: 'Opération' },
  { value: 'stress', label: 'Période chargée (travail, sommeil)' },
]
const MANUAL_DISTANCES = [
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '21.1', label: 'Semi' },
  { value: '42.195', label: 'Marathon' },
]

export function CompleteOnboarding({
  preview,
  ready,
  onSave,
  onComplete,
}: {
  variant: Variant
  preview: boolean
  ready: boolean
  onSave: (answers: CompleteAnswers, stepReached: number) => Promise<void>
  onComplete: (answers: CompleteAnswers) => Promise<void>
}) {
  const [index, setIndex] = useState(0)
  const [a, setA] = useState<CompleteAnswers>({ wearables: [], performances: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const patch = (p: Partial<CompleteAnswers>) => setA((cur) => ({ ...cur, ...p }))
  // « M'entraîner » n'a pas de course à choisir : l'étape Course disparaît du fil.
  const flow = STEPS.filter((s) => s.id !== 'target' || a.goal?.type !== 'train')
  const step = flow[Math.min(index, flow.length - 1)]

  const valid: Record<string, boolean> = {
    reason: !!a.reason,
    wearables: (a.wearables?.length ?? 0) > 0 || !!a.strava,
    identity: !!a.identity?.firstName.trim() && !!a.identity.lastName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.identity.email.trim()),
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
      await onSave(flat, index + 1)
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
  const ctx = { weeklyPct: weeklyStat.data?.percentile ?? null }

  // Pacer écrit ses bulles une à une, avec un temps de frappe ; la zone de réponse vient ensuite.
  const lines = coachLines(step.id, a, ctx)
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
          <p className="text-muted-foreground text-xs">{typing && !ready2 ? 'écrit…' : `Ton coach · ${Math.min(index + 1, flow.length)} / ${flow.length}`}</p>
        </div>
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-foreground transition-all duration-500" style={{ width: `${((index + 1) / flow.length) * 100}%` }} />
        </span>
      </div>

      {/* Échanges passés : les bulles du coach, puis la réponse résumée */}
      {flow.slice(0, index).map((s) => (
        <div key={s.id} className="flex flex-col gap-2">
          {coachLines(s.id, a, ctx).map((line, i) => (
            <CoachBubble key={i} first={i === 0}>
              {line}
            </CoachBubble>
          ))}
          <UserBubble>{summarize(s.id, a)}</UserBubble>
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
      </div>

      {ready2 &&
        (step.id === 'generate' ? (
          <div className="animate-[fade-in_300ms_ease-out] rounded-[26px] border bg-card p-5">
            <GenerateStep answers={a} preview={preview} onDone={() => onComplete(withPlanFields(a))} />
          </div>
        ) : step.id === 'reason' || step.id === 'goal' ? (
          <QuickReplies
            options={step.id === 'reason' ? REASONS : GOALS}
            disabled={!ready || busy}
            onPick={(value) =>
              void next(step.id === 'reason' ? { reason: value } : { goal: { type: value, terrain: 'road', race: null, date: null } })
            }
            onBack={index > 0 ? () => setIndex(index - 1) : undefined}
          />
        ) : (
          <form
            className="flex animate-[fade-in_300ms_ease-out] flex-col gap-6 rounded-[26px] border bg-card p-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid[step.id] && ready) void next()
            }}
          >
            {step.id === 'wearables' && <WearablesStep answers={a} patch={patch} />}
            {step.id === 'identity' && <IdentityStep answers={a} patch={patch} />}
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
              <Button type="button" variant="ghost" size="sm" disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}>
                <ArrowLeftIcon className="size-4" /> Modifier
              </Button>
              <Button type="submit" loading={busy} disabled={!ready || !valid[step.id]}>
                {step.id === 'gear' ? 'Créer mon plan' : 'Envoyer'} <SendIcon className="size-4" />
              </Button>
            </div>
          </form>
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
          <ArrowLeftIcon className="size-3" /> Modifier ma réponse précédente
        </button>
      )}
    </div>
  )
}

// ---------- Conversation ----------

/** Ce que dit Pacer à chaque étape (peut dépendre des réponses précédentes). */
const REASON_PRAISE: Record<string, string> = {
  race: 'Une course en ligne de mire, c’est le meilleur des moteurs.',
  progress: 'Envie de progresser : on va bien s’entendre.',
  structure: 'Bonne idée, c’est la régularité qui fait progresser.',
  comeback: 'Bravo de t’y remettre, c’est souvent le plus dur.',
  start: 'Bienvenue dans la course à pied, tu vas adorer.',
}

function volumePraise(km: number, pct: number | null) {
  if (pct !== null && pct >= 50) return `${km} km par semaine : tu cours plus que ${pct} % des coureurs de Raice.run. Respect.`
  if (km >= 60) return `${km} km par semaine, c’est un sacré volume. Chapeau.`
  if (km >= 30) return `${km} km par semaine, belle régularité.`
  if (km > 0) return `${km} km par semaine, c’est une bonne base pour construire.`
  return 'On partira de zéro, tout en douceur. C’est la meilleure façon de commencer.'
}

/** Répliques de Pacer : un petit mot sur la réponse précédente, puis la question. */
function coachLines(step: string, a: CompleteAnswers, ctx: { weeklyPct: number | null }): string[] {
  const first = a.identity?.firstName.trim()
  const race = a.goal?.race
  const h = a.health
  switch (step) {
    case 'reason':
      return ['Salut ! Moi c’est Pacer, ton coach running.', 'Avant de construire ton plan, dis-moi : qu’est-ce qui t’amène ici ?']
    case 'wearables':
      return [REASON_PRAISE[a.reason ?? ''] ?? 'Bien reçu.', 'Tu cours avec quelle montre ? Je récupère ton historique pendant qu’on discute.']
    case 'identity': {
      const w = a.wearables ?? []
      const st = a.strava
      const praise = st
        ? `J’ai lu tes ${st.runs} sorties Strava${st.recent.runs ? `, dont ${st.recent.runs} ces 12 dernières semaines` : ''}. Joli historique.`
        : w.includes('none')
        ? 'Pas de montre ? Aucun souci, on fera aux sensations.'
        : w.some((x) => x === 'coros' || x === 'garmin')
          ? 'Top, je pourrai lire tes séances directement depuis ta montre.'
          : 'Noté, je te préviens dès que ta montre est compatible.'
      return [praise, 'On fait connaissance ? Ton prénom, ton nom et ton e-mail. Je regarde au passage si tu as des résultats publics.']
    }
    case 'goal':
      return [
        a.utmb?.index
          ? `Enchanté ${first} ! Index UTMB ${a.utmb.index}, joli palmarès.`
          : a.utmb
            ? `Enchanté ${first} ! J’ai trouvé ton profil UTMB, je m’en servirai.`
            : `Enchanté${first ? ` ${first}` : ''} !`,
        'C’est quoi ton objectif en ce moment ?',
      ]
    case 'target':
      return a.goal?.type === 'distance'
        ? ['Un nouveau cap, belle idée.', 'Quelle distance tu veux courir ?']
        : ['Une course, j’adore.', 'Laquelle ? Choisis la distance, trouve-la dans la liste, puis donne-moi la date.']
    case 'estimate':
      return race
        ? [`${race.name}, excellent choix.`, 'J’ai fait le calcul : voilà ce que je te vois capable de faire. Ajuste si tu veux viser plus vite ou plus prudent.']
        : ['Régulier, c’est la clé.', 'Donne-moi un chrono récent : je calibre tes allures avec.']
    case 'volume': {
      const e = a.estimate
      const praise = e?.target && e.predicted ? (e.target < e.predicted * 0.97 ? 'Objectif ambitieux, j’aime ton état d’esprit.' : 'Objectif réaliste : c’est comme ça qu’on finit fort.') : 'Merci, c’est noté.'
      return [
        praise,
        a.strava?.recent.runs
          ? `D’après Strava, tu tournes autour de ${a.strava.recent.weeklyKm} km par semaine : je l’ai pré-rempli. Corrige si ça a changé.`
          : 'Combien de kilomètres tu cours par semaine en ce moment ?',
      ]
    }
    case 'pains':
      return [volumePraise(h?.weeklyKm ?? 0, ctx.weeklyPct), 'Des douleurs ces dernières semaines ? Touche les zones qui t’ont gêné. Rien du tout ? Envoie directement.']
    case 'events':
      return [
        h?.pains.length ? 'Merci de me le dire, j’en tiendrai compte dans les charges.' : 'Aucune douleur, parfait.',
        'Et récemment, il s’est passé quelque chose ? Blessure, maladie, pause, période chargée… tout compte.',
      ]
    case 'gear':
      return [h?.events.length ? 'Merci pour ta franchise, on adaptera la reprise.' : 'Rien à signaler, idéal pour attaquer.', 'Dernière question, promis : tu cours avec quelles chaussures ? Je suivrai leur usure.']
    default:
      return [`Merci${first ? ` ${first}` : ''}, tu as été parfait. J’ai tout ce qu’il me faut.`, 'Je construis ton plan, ça prend quelques secondes.']
  }
}

/** Réponse du coureur, résumée en une phrase dans sa bulle. */
function summarize(step: string, a: CompleteAnswers): string {
  const h = a.health
  switch (step) {
    case 'reason':
      return REASONS.find((r) => r.value === a.reason)?.label ?? '—'
    case 'wearables': {
      const strava = a.strava ? `historique Strava (${a.strava.runs} sorties)` : ''
      if (!a.wearables?.length) return strava || '—'
      return [a.wearables.includes('none') ? 'Je cours sans montre' : a.wearables.map((w) => WEARABLES.find((x) => x.id === w)?.name ?? w).join(', '), strava].filter(Boolean).join(' + ')
    }
    case 'identity': {
      const id = a.identity
      return id ? `${id.firstName} ${id.lastName} · ${id.email}${a.utmb ? ' · c’est moi sur UTMB' : ''}` : '—'
    }
    case 'goal':
      return GOALS.find((x) => x.value === a.goal?.type)?.label ?? '—'
    case 'target': {
      const g = a.goal
      const date = g?.date ? ` · ${new Date(`${g.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
      return g?.race ? `${g.race.name}${date}` : '—'
    }
    case 'estimate':
      return a.estimate?.target ? `Je vise ${formatDuration(a.estimate.target)}` : 'On verra en route'
    case 'volume':
      return `${h?.weeklyKm ?? 20} km par semaine`
    case 'pains':
      return h?.pains.length ? `${h.pains.join(', ')}${h.painLevel ? ` · gêne ${['', 'légère', 'gênante', 'modérée', 'forte', 'très forte'][h.painLevel]}` : ''}` : 'Aucune douleur'
    case 'events': {
      const ev = (h?.events ?? []).map((e) => EVENTS.find((x) => x.value === e)?.label ?? e)
      return [ev.length ? ev.join(', ') : 'Rien de particulier', h?.notes.trim()].filter(Boolean).join(' · ')
    }
    case 'gear': {
      const g = a.gear
      return g?.brand ? `${g.brand}${g.model ? ` ${g.model}` : ''} · ${g.shoeKm} km` : 'Pas de paire renseignée'
    }
    default:
      return ''
  }
}

function CoachBubble({ children, first }: { children: React.ReactNode; first: boolean }) {
  return (
    <div className="flex animate-[fade-in_300ms_ease-out] items-end gap-2">
      <span className="w-9 shrink-0">{first && <CoachAvatar />}</span>
      <p className="max-w-[85%] rounded-2xl rounded-bl-md border bg-card px-4 py-2.5 text-sm leading-relaxed">{children}</p>
    </div>
  )
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background text-sm">{children}</p>
}

function TypingBubble({ avatar }: { avatar: boolean }) {
  return (
    <div className="flex items-end gap-2">
      <span className="w-9 shrink-0">{avatar && <CoachAvatar />}</span>
      <span className="flex gap-1 rounded-2xl rounded-bl-md border bg-card px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
    </div>
  )
}

/** Champs à plat attendus par la demande de plan (distance, date, volume). */
function withPlanFields(a: CompleteAnswers): CompleteAnswers {
  const race = a.goal?.race
  return {
    ...a,
    distance: race ? distanceCategory(race.km, race.elevation) : a.distance,
    race_date: a.goal?.date ?? null,
    weekly_km: a.health?.weeklyKm,
  }
}


// ---------- 1. Motivation ----------

// ---------- 2. Montres ----------

function WearablesStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const value = answers.wearables ?? []
  const onChange = (wearables: string[]) => patch({ wearables })
  const none = value.includes('none')
  const toggle = (id: string, on: boolean) => onChange(on ? [...value.filter((v) => v !== 'none'), id] : value.filter((v) => v !== id))
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
            <span className="flex-1 text-sm">{w.available ? w.name : `${w.name} · bientôt`}</span>
            <Checkbox aria-label={w.name} disabled={!w.available} checked={value.includes(w.id)} onCheckedChange={(c) => toggle(w.id, c === true)} />
          </label>
        ))}
      </div>
      <StravaImport answers={answers} patch={patch} />
      <Checkbox label="Je cours sans montre" checked={none} onCheckedChange={(c) => onChange(c === true ? ['none'] : [])} />
      {value.some((v) => v === 'coros' || v === 'garmin') && (
        <p className="rounded-[20px] border bg-card p-4 text-muted-foreground text-sm">
          La connexion à ta montre se fait juste après la création du compte. En attendant, on part de tes résultats publics et de ce que tu nous dis.
        </p>
      )}
    </>
  )
}

/** Logo Strava (simple-icons, CC0). */
function StravaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  )
}

/**
 * Strava limite le nombre de coureurs connectables par application : on propose de connecter la montre
 * directement, ou d'importer l'export du compte Strava (lu dans le navigateur), et une liste d'attente.
 */
function StravaImport({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'choices' | 'import'>('choices')
  const [need, setNeed] = useState(answers.strava_need ?? '')
  const st = answers.strava
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setView(st ? 'import' : 'choices')
          setOpen(true)
        }}
        className={`flex items-center gap-3 rounded-[20px] border p-4 text-left transition-colors hover:border-foreground/50 ${st ? 'border-primary' : ''}`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#FC4C02] text-white">
          <StravaLogo className="size-5" />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-sm">{st ? 'Historique Strava importé' : 'J’utilise Strava'}</span>
          <span className="text-muted-foreground text-xs">
            {st ? `${st.runs} sorties · ${st.recent.weeklyKm} km/sem. ces 12 dernières semaines` : 'Importe ton historique en quelques clics'}
          </span>
        </span>
        {st && <CheckIcon className="size-4" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Connecter Strava" description="Strava limite le nombre de coureurs qu’une application peut connecter. Voici comment faire :">
          {view === 'choices' ? (
            <div className="flex flex-col gap-5">
              <div className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">1</span>
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-sm">Connecte ta montre directement</p>
                  <p className="text-muted-foreground text-sm">
                    Raice.run marche mieux avec la source qui enregistre tes séances (COROS, Garmin) : des données plus propres, avec le sommeil et la récupération.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 border-t pt-5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">2</span>
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-sm">Importe ton historique Strava</p>
                    <p className="text-muted-foreground text-sm">Tes sorties passées servent à calibrer ton plan et tes allures.</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setView('import')}>
                    Importer mon historique Strava
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t pt-5">
                <p className="text-sm">
                  <strong className="font-medium">Besoin de Strava quand même ?</strong> Dis-nous pourquoi, ça nous aide à prioriser.
                </p>
                <Textarea label="Tu utilises Strava pour quoi ?" rows={2} value={need} onChange={(e) => setNeed(e.target.value)} />
                <Button type="button" variant="secondary" disabled={!need.trim() || need.trim() === answers.strava_need} onClick={() => patch({ strava_need: need.trim() })}>
                  {answers.strava_need && need.trim() === answers.strava_need ? 'Merci, c’est noté' : 'Rejoindre la liste d’attente'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {!st && (
                <button type="button" onClick={() => setView('choices')} className="flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground">
                  <ArrowLeftIcon className="size-4" /> Retour
                </button>
              )}
              <p className="text-sm">
                <strong className="font-medium">Importe ton historique Strava.</strong> L’archive est lue directement dans ton navigateur : seul un résumé (volume, sorties longues, meilleurs chronos) est
                envoyé à Raice.run.
              </p>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                <li>
                  <a href="https://www.strava.com/athlete/download_my_account" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                    Demande ton archive sur Strava <ExternalLinkIcon className="size-3.5" />
                  </a>
                </li>
                <li>Strava t’envoie un lien de téléchargement par e-mail quand elle est prête.</li>
                <li>Dépose le ZIP ici, pas besoin de le décompresser.</li>
              </ol>
              <FileDropzone
                accept=".zip,application/zip"
                multiple={false}
                maxFiles={1}
                label="Dépose ton export Strava (ZIP)"
                description="ou choisis le fichier sur ton appareil"
                dropLabel="Lâche le ZIP ici"
                note="Lu dans ton navigateur, rien n’est envoyé"
                onUpload={async (item, { onProgress }) => {
                  if (!item.file) throw new Error('Fichier introuvable')
                  const summary = await readStravaExport(item.file, onProgress)
                  if (!summary.runs) throw new Error('Aucune course à pied dans cet export.')
                  onProgress(100)
                  patch({ strava: summary })
                }}
              />
              {st && (
                <div className="grid grid-cols-3 gap-2 rounded-[20px] border bg-card p-4 text-center">
                  <div>
                    <p className="font-semibold text-xl tabular-nums">{st.runs}</p>
                    <p className="text-muted-foreground text-xs">sorties</p>
                  </div>
                  <div>
                    <p className="font-semibold text-xl tabular-nums">{st.recent.weeklyKm} km</p>
                    <p className="text-muted-foreground text-xs">par semaine (12 sem.)</p>
                  </div>
                  <div>
                    <p className="font-semibold text-xl tabular-nums">{st.recent.longestKm} km</p>
                    <p className="text-muted-foreground text-xs">plus longue sortie</p>
                  </div>
                </div>
              )}
              {st && (
                <Button type="button" onClick={() => setOpen(false)}>
                  C’est bon
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
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

function IdentityStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const id = answers.identity ?? { firstName: '', lastName: '', email: '' }
  const set = (p: Partial<typeof id>) => patch({ identity: { ...id, ...p } })
  const fullName = useDebounced(`${id.firstName} ${id.lastName}`.trim())
  const qc = useQueryClient()
  const runners = useQuery({
    queryKey: ['utmb', 'runners', fullName],
    queryFn: () => api<UtmbRunner[]>(`/lookup/utmb/runners?q=${encodeURIComponent(fullName)}`),
    enabled: id.firstName.trim().length >= 2 && id.lastName.trim().length >= 2,
    staleTime: Infinity,
  })

  function pick(uri: string) {
    if (uri === 'none') return patch({ utmb: null })
    const r = runners.data?.find((x) => x.uri === uri)
    patch({ utmb: r ? { uri: r.uri, name: r.name, index: r.index } : null })
    // Chargement en arrière-plan des résultats pendant la suite du questionnaire.
    void qc.prefetchQuery({ queryKey: ['utmb', 'runner', uri], queryFn: () => api<UtmbProfile>(`/lookup/utmb/runner/${uri}`), staleTime: Infinity })
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Prénom" autoComplete="given-name" value={id.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        <Input label="Nom" autoComplete="family-name" value={id.lastName} onChange={(e) => set({ lastName: e.target.value })} />
      </div>
      <Input label="E-mail" type="email" autoComplete="email" placeholder="nom@exemple.fr" value={id.email} onChange={(e) => set({ email: e.target.value })} />

      {runners.data && runners.data.length > 0 && (
        <UtmbPicker runners={runners.data.slice(0, 6)} value={answers.utmb?.uri ?? (answers.utmb === null ? 'none' : null)} onPick={pick} />
      )}
      <p className="text-muted-foreground text-xs">
        Course sur route : l’index running FFA n’est pas encore relié. Tu pourras ajouter un chrono récent à l’étape d’estimation.
      </p>
    </>
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
        <span className="font-medium text-sm">C’est toi sur UTMB ?</span>
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
        Ce n’est pas moi
      </button>
    </div>
  )
}

// ---------- 4. Objectif ----------

const GOALS = [
  { value: 'race', label: 'Faire une course', description: 'Une date, une distance, un objectif.', icon: <FlagIcon /> },
  { value: 'train', label: 'M’entraîner régulièrement', description: 'Sans course en vue pour l’instant.', icon: <ActivityIcon /> },
  { value: 'distance', label: 'Courir une distance', description: 'Mon premier 10 km, semi ou marathon.', icon: <CompassIcon /> },
]

/** Filtre de distance, avant la recherche : catégories classiques sur route, tranches de longueur en trail. */
const DIST_FILTERS = {
  road: [
    { value: '5k', label: '5 km' },
    { value: '10k', label: '10 km' },
    { value: 'half', label: 'Semi' },
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
  const goal = answers.goal ?? { type: 'race', terrain: 'road' as const, race: null, date: null }
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
  const [customRace, setCustomRace] = useState({ name: '', km: 10, elevation: 0 })

  if (goal.type === 'distance')
    return (
      <ChipGroup
        label="Distance"
        multiple={false}
        options={MANUAL_DISTANCES}
        value={goal.race ? [String(goal.race.km)] : []}
        onValueChange={([v]) => set({ race: v ? { id: `distance:${v}`, name: MANUAL_DISTANCES.find((d) => d.value === v)!.label, detail: 'Distance visée', km: Number(v), elevation: 0, date: null, source: 'saisie' } : null })}
      />
    )

  const list = races.data ?? []
  const more = list.length > shown
  return (
    <div className="flex flex-col gap-4">
      {!custom ? (
        <>
          <div className="flex flex-col gap-2">
            <ChipGroup label="Distance" multiple={false} options={DIST_FILTERS.road} value={dist ? [dist] : []} onValueChange={([v]) => setDist(v ?? '')} />
            <span className="flex w-fit items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-muted-foreground text-xs">
              <MountainIcon className="size-3" /> Trail · bientôt
            </span>
          </div>
          <SearchField label="Rechercher une course" placeholder="Ex. Marathon de Paris" value={q} onValueChange={setQ} />
          {list.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <RadioCards
                  aria-label="Course"
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
                  Voir plus ({list.length - shown}) <ChevronDownIcon className="size-4" />
                </Button>
              )}
            </div>
          ) : (
            races.isFetched && <EmptyState title="Aucune course trouvée" description="Essaie un autre nom, ou saisis ta course." />
          )}
          <Button type="button" variant="secondary" onClick={() => setCustom(true)}>
            <PlusIcon className="size-4" /> Ma course n’est pas dans la liste
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-4 rounded-[20px] border bg-background p-4">
          <Input label="Nom de la course" value={customRace.name} onChange={(e) => setCustomRace({ ...customRace, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Distance" value={customRace.km} min={1} max={250} suffix=" km" locale="fr-FR" onValueChange={(km) => setCustomRace({ ...customRace, km })} />
            <NumberField label="Dénivelé +" value={customRace.elevation} min={0} max={12000} step={50} suffix=" m" locale="fr-FR" onValueChange={(elevation) => setCustomRace({ ...customRace, elevation })} />
          </div>
          <Button
            type="button"
            disabled={!customRace.name.trim()}
            onClick={() => {
              set({ race: { id: 'saisie', name: customRace.name.trim(), detail: `${customRace.km} km · ${customRace.elevation} m D+`, km: customRace.km, elevation: customRace.elevation, date: null, source: 'saisie' } })
              setCustom(false)
            }}
          >
            Utiliser cette course
          </Button>
        </div>
      )}
      {goal.race && (
        <p className="text-sm">
          Course choisie : <strong className="font-medium">{goal.race.name}</strong> · {goal.race.detail}
        </p>
      )}
      <DatePicker
        label="Date de la course"
        locale="fr-FR"
        placeholder="Choisir la date"
        minDate={new Date()}
        value={goal.date ? new Date(`${goal.date}T12:00:00`) : undefined}
        onChange={(d) => set({ date: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null })}
      />
    </div>
  )
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
        .map((r) => ({ label: r.race, km: r.km, elevation: r.elevation, seconds: parseDuration(r.time) ?? 0, date: r.date, source: 'utmb' as const }))
        .filter((p) => p.seconds > 0),
    [profile.data],
  )
  const perfs = [...manual, ...(answers.strava?.performances ?? []), ...utmbPerfs]
  const race = answers.goal?.race
  const prediction = race ? predict(perfs, race.km, race.elevation) : null
  const target = answers.estimate?.target ?? prediction?.seconds ?? null

  useEffect(() => {
    if (prediction && answers.estimate?.predicted !== Math.round(prediction.seconds)) {
      patch({ estimate: { predicted: Math.round(prediction.seconds), target: answers.estimate?.target ?? Math.round(prediction.seconds) } })
    }
  }, [prediction?.seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState({ km: '10', time: '' })
  const addManual = () => {
    const seconds = parseDuration(draft.time)
    if (!seconds) return
    const km = Number(draft.km)
    patch({ performances: [...(answers.performances ?? []), { label: `${MANUAL_DISTANCES.find((d) => d.value === draft.km)?.label} récent`, km, elevation: 0, seconds, source: 'manuel', date: new Date().toISOString().slice(0, 10) }] })
    setDraft({ ...draft, time: '' })
  }

  return (
    <>

      {uri && profile.isPending && <TextShimmer as="p" className="text-sm">Lecture de tes résultats UTMB…</TextShimmer>}

      {race && prediction && target && (
        <div className="flex flex-col gap-6 rounded-[26px] border bg-background p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-sm">Temps visé</p>
              <p className="font-semibold text-5xl tabular-nums tracking-tight">{formatDuration(target)}</p>
              <p className="mt-2 text-muted-foreground text-sm">
                {formatPace(target, race.km)} · estimation {formatDuration(prediction.seconds)}
              </p>
            </div>
            <Badge tone={target < prediction.seconds * 0.97 ? 'warning' : 'success'}>{target < prediction.seconds * 0.97 ? 'Ambitieux' : 'Réaliste'}</Badge>
          </div>
          <RulerSlider
            label="Ajuster le temps visé"
            min={Math.round((prediction.seconds * 0.85) / 60) * 60}
            max={Math.round((prediction.seconds * 1.2) / 60) * 60}
            step={60}
            majorEvery={10}
            value={Math.round(target / 60) * 60}
            onValueChange={(v) => patch({ estimate: { predicted: Math.round(prediction.seconds), target: v } })}
            format={formatDuration}
          />
          <p className="text-muted-foreground text-xs">Basé sur : {prediction.basedOn.map((p) => `${p.label} (${formatDuration(p.seconds)})`).join(' · ')}</p>
        </div>
      )}

      {race && !prediction && !profile.isPending && (
        <EmptyState title="Pas encore assez de données" description="Ajoute un chrono récent ci-dessous pour obtenir une estimation." />
      )}

      <div className="flex flex-col gap-4 rounded-[26px] border p-5">
        <span className="font-medium text-sm">Ajouter un chrono récent</span>
        <ChipGroup label="Distance du chrono" multiple={false} options={MANUAL_DISTANCES} value={[draft.km]} onValueChange={([v]) => v && setDraft({ ...draft, km: v })} />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input label="Temps" placeholder="ex. 48:30 ou 1:45:00" inputMode="numeric" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          </div>
          <Button type="button" variant="secondary" disabled={!parseDuration(draft.time)} onClick={addManual}>
            Ajouter
          </Button>
        </div>
        {manual.map((p, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span>
              {p.label} · <span className="tabular-nums">{formatDuration(p.seconds)}</span>
            </span>
            <button
              type="button"
              aria-label="Retirer ce chrono"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => patch({ performances: (answers.performances ?? []).filter((x) => x !== p), estimate: { predicted: null, target: null } })}
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

type StepProps = { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }

function useHealth({ answers, patch }: StepProps) {
  const h = answers.health ?? { pains: [], painLevel: 0, events: [], weeklyKm: answers.strava?.recent.runs ? answers.strava.recent.weeklyKm : 20, notes: '' }
  return [h, (p: Partial<typeof h>) => patch({ health: { ...h, ...p } })] as const
}

function VolumeStep(props: StepProps) {
  const [h, set] = useHealth(props)
  // Enregistre la valeur par défaut, pour qu'un envoi direct garde bien 20 km.
  useEffect(() => {
    if (!props.answers.health) set({})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <NumberField label="Kilomètres par semaine en ce moment" value={h.weeklyKm} min={0} max={200} suffix=" km" locale="fr-FR" onValueChange={(weeklyKm) => set({ weeklyKm })} />
}

function PainsStep(props: StepProps) {
  const [h, set] = useHealth(props)
  return (
    <>
      <ChipGroup label="Zones douloureuses" options={PAINS} value={h.pains} onValueChange={(pains) => set({ pains, painLevel: pains.length ? h.painLevel : 0 })} />
      {h.pains.length > 0 && (
        <Rating label="Intensité de la gêne" max={5} value={h.painLevel} onChange={(painLevel) => set({ painLevel })} valueLabels={['Légère', 'Gênante', 'Modérée', 'Forte', 'Très forte']} emptyLabel="Non renseignée" />
      )}
      {h.painLevel >= 4 && <DoctorNote />}
    </>
  )
}

function EventsStep(props: StepProps) {
  const [h, set] = useHealth(props)
  return (
    <>
      <ChipGroup label="Ces derniers mois" options={EVENTS} value={h.events} onValueChange={(events) => set({ events })} />
      <Textarea label="À nous dire (facultatif)" placeholder="Ex. entorse en mars, je reprends doucement" rows={3} value={h.notes} onChange={(e) => set({ notes: e.target.value })} />
      {h.events.includes('surgery') && <DoctorNote />}
    </>
  )
}

function DoctorNote() {
  return (
    <p className="rounded-[20px] border border-[var(--warning)] p-4 text-sm">
      Avec une douleur forte ou une opération récente, demande l’avis d’un médecin avant de reprendre l’entraînement. Ton plan démarrera de façon très progressive.
    </p>
  )
}

// ---------- 7. Matériel ----------

function GearStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const g = answers.gear ?? { brand: null, model: '', shoeKm: 200, rotation: false }
  const set = (p: Partial<typeof g>) => patch({ gear: { ...g, ...p } })
  const brands = useQuery({ queryKey: ['shoe-brands'], queryFn: () => api<string[]>('/lookup/shoe-brands'), staleTime: Infinity })
  const shoes = useQuery({ queryKey: ['shoes'], queryFn: () => api<Shoe[]>('/lookup/shoes'), staleTime: Infinity })
  // Quelques modèles connus de la marque, en exemple dans le champ libre.
  const examples = (shoes.data ?? []).filter((s) => s.brand === g.brand).slice(0, 3).map((s) => s.model)
  return (
    <>
      <Combobox
        label="Marque"
        placeholder="Rechercher une marque"
        emptyMessage="Marque introuvable"
        options={(brands.data ?? []).map((b) => ({ value: b, label: b }))}
        value={g.brand ?? undefined}
        onValueChange={(brand) => set({ brand })}
      />
      <Input
        label="Modèle"
        placeholder={examples.length ? `Ex. ${examples.join(', ')}` : 'Ex. Pegasus 41'}
        value={g.model}
        onChange={(e) => set({ model: e.target.value })}
      />
      <NumberField label="Kilomètres déjà faits avec" value={g.shoeKm} min={0} max={2000} step={10} largeStep={50} suffix=" km" locale="fr-FR" onValueChange={(shoeKm) => set({ shoeKm })} />
      <Switch label="J’alterne avec une autre paire" checked={g.rotation} onCheckedChange={(rotation) => set({ rotation })} />
      {g.shoeKm >= 700 && <p className="text-muted-foreground text-sm">Au-delà de 700 km, l’amorti baisse nettement : pense à prévoir une nouvelle paire.</p>}
    </>
  )
}

// ---------- 8. Génération ----------

const BUILD = [
  { id: 'history', label: 'Lecture de ton historique' },
  { id: 'paces', label: 'Calcul de tes allures' },
  { id: 'weeks', label: 'Construction des semaines' },
  { id: 'sessions', label: 'Placement des séances clés' },
  { id: 'load', label: 'Vérification de la charge' },
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
      <Progress value={Math.min(current, BUILD.length)} max={BUILD.length} label={finished ? 'Terminé' : BUILD[Math.min(current, BUILD.length - 1)].label} showValue />
      <Stepper steps={BUILD} current={current} orientation="vertical" details="current" label="Génération du plan" completeLabel="Plan prêt" />
      {!finished && <TextShimmer as="p" className="text-muted-foreground text-sm">{`${BUILD[Math.min(current, BUILD.length - 1)].label}…`}</TextShimmer>}
      {finished && preview && <pre className="max-h-72 overflow-auto rounded-[20px] border bg-card p-4 text-xs">{JSON.stringify(answers, null, 2)}</pre>}
    </div>
  )
}
