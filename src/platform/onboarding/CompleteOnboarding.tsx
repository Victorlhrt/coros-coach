import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ActivityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarCheckIcon,
  CompassIcon,
  FlagIcon,
  FootprintsIcon,
  GaugeIcon,
  HeartPulseIcon,
  LayoutListIcon,
  MountainIcon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  SproutIcon,
  TargetIcon,
  TrashIcon,
  TrendingUpIcon,
  UserIcon,
  WatchIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import { Combobox } from '@/components/arc/combobox/combobox'
import { DatePicker } from '@/components/arc/date-picker/date-picker'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Input } from '@/components/arc/input/input'
import { NumberField } from '@/components/arc/number-field/number-field'
import { Progress } from '@/components/arc/progress/progress'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { Rating } from '@/components/arc/rating/rating'
import { RulerSlider } from '@/components/arc/ruler-slider/ruler-slider'
import { SearchField } from '@/components/arc/search-field/search-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Stepper } from '@/components/arc/stepper/stepper'
import { Switch } from '@/components/arc/switch/switch'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { Textarea } from '@/components/arc/textarea/textarea'
import { api, type Variant } from '../api'
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
  utmb?: { uri: string; name: string } | null
  goal?: { type: string; terrain: 'road' | 'trail'; race: Race | null; date: string | null }
  performances?: Performance[]
  estimate?: { predicted: number | null; target: number | null }
  health?: { pains: string[]; painLevel: number; events: string[]; weeklyKm: number; notes: string }
  gear?: { brand: string | null; model: string; shoeKm: number; rotation: boolean }
  // Champs à plat repris par la demande de plan côté serveur.
  distance?: string
  race_date?: string | null
  weekly_km?: number
}

const STEPS = [
  { id: 'reason', label: 'Motivation' },
  { id: 'wearables', label: 'Montre' },
  { id: 'identity', label: 'Profil' },
  { id: 'goal', label: 'Objectif' },
  { id: 'estimate', label: 'Estimation' },
  { id: 'health', label: 'Santé' },
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
  { id: 'apple', name: 'Apple Watch', available: false },
  { id: 'suunto', name: 'Suunto', available: false },
  { id: 'polar', name: 'Polar', available: false },
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
  variant,
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
  const step = STEPS[index]
  const patch = (p: Partial<CompleteAnswers>) => setA((cur) => ({ ...cur, ...p }))

  const valid: Record<string, boolean> = {
    reason: !!a.reason,
    wearables: (a.wearables?.length ?? 0) > 0,
    identity: !!a.identity?.firstName.trim() && !!a.identity.lastName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.identity.email.trim()),
    goal: !!a.goal && (a.goal.type !== 'race' || (!!a.goal.race && !!a.goal.date)),
    estimate: true,
    health: true,
    gear: true,
    generate: true,
  }

  async function next() {
    setBusy(true)
    setError('')
    try {
      const flat = withPlanFields(a)
      await onSave(flat, index + 1)
      setA(flat)
      setIndex(index + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={STEPS} current={index} compact label={`Parcours ${variant.name}`} />
      {step.id === 'generate' ? (
        <GenerateStep answers={a} preview={preview} onDone={() => onComplete(withPlanFields(a))} />
      ) : (
        <form
          className="flex flex-col gap-8"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid[step.id] && ready) void next()
          }}
        >
          {step.id === 'reason' && <ReasonStep value={a.reason} onChange={(reason) => patch({ reason })} />}
          {step.id === 'wearables' && <WearablesStep value={a.wearables ?? []} onChange={(wearables) => patch({ wearables })} />}
          {step.id === 'identity' && <IdentityStep answers={a} patch={patch} />}
          {step.id === 'goal' && <GoalStep answers={a} patch={patch} />}
          {step.id === 'estimate' && <EstimateStep answers={a} patch={patch} />}
          {step.id === 'health' && <HealthStep answers={a} patch={patch} />}
          {step.id === 'gear' && <GearStep answers={a} patch={patch} />}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}>
              <ArrowLeftIcon className="size-4" /> Retour
            </Button>
            <Button type="submit" loading={busy} disabled={!ready || !valid[step.id]}>
              {step.id === 'gear' ? 'Créer mon plan' : 'Continuer'} <ArrowRightIcon className="size-4" />
            </Button>
          </div>
        </form>
      )}
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

function Heading({ title, text, icon: Icon }: { title: string; text?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col gap-2">
      {Icon && (
        <span className="mb-2 flex size-10 items-center justify-center rounded-[14px] border bg-card">
          <Icon className="size-5" />
        </span>
      )}
      <h1 className="font-heading font-semibold text-balance text-2xl tracking-tight md:text-3xl">{title}</h1>
      {text && <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>}
    </div>
  )
}

// ---------- 1. Motivation ----------

function ReasonStep({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <>
      <Heading icon={SparklesIcon} title="Qu’est-ce qui t’amène sur Raice.run ?" text="Une seule réponse : celle qui compte le plus aujourd’hui." />
      <RadioCards aria-label="Motivation" layout="list" options={REASONS} value={value ?? null} onValueChange={onChange} />
    </>
  )
}

// ---------- 2. Montres ----------

function WearablesStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const none = value.includes('none')
  const toggle = (id: string, on: boolean) => onChange(on ? [...value.filter((v) => v !== 'none'), id] : value.filter((v) => v !== id))
  return (
    <>
      <Heading icon={WatchIcon} title="Avec quoi cours-tu ?" text="On récupère ton historique pendant que tu finis le questionnaire : le plan démarre de tes vraies allures." />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {WEARABLES.map((w) => (
          <label
            key={w.id}
            className={`flex items-center gap-3 rounded-[20px] border p-4 ${w.available ? 'cursor-pointer bg-card' : 'opacity-50'} ${value.includes(w.id) ? 'border-primary' : ''}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border bg-background">
              {w.logo ? (
                <img src={w.logo} alt="" className={`size-full object-contain ${w.invert ? 'p-2 invert' : ''}`} />
              ) : (
                <WatchIcon className="size-5 text-muted-foreground" />
              )}
            </span>
            <span className="flex-1 text-sm">{w.available ? w.name : `${w.name} · bientôt`}</span>
            <Checkbox aria-label={w.name} disabled={!w.available} checked={value.includes(w.id)} onCheckedChange={(c) => toggle(w.id, c === true)} />
          </label>
        ))}
      </div>
      <Checkbox label="Je cours sans montre" checked={none} onCheckedChange={(c) => onChange(c === true ? ['none'] : [])} />
      {value.some((v) => v === 'coros' || v === 'garmin') && (
        <p className="rounded-[20px] border bg-card p-4 text-muted-foreground text-sm">
          La connexion à ta montre se fait juste après la création du compte. En attendant, on part de tes résultats publics et de ce que tu nous dis.
        </p>
      )}
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
    patch({ utmb: r ? { uri: r.uri, name: r.name } : null })
    // Chargement en arrière-plan des résultats pendant la suite du questionnaire.
    void qc.prefetchQuery({ queryKey: ['utmb', 'runner', uri], queryFn: () => api<UtmbProfile>(`/lookup/utmb/runner/${uri}`), staleTime: Infinity })
  }

  return (
    <>
      <Heading icon={UserIcon} title="Faisons connaissance" text="On cherche tes résultats publics pour partir de ton vrai niveau." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Prénom" autoComplete="given-name" value={id.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        <Input label="Nom" autoComplete="family-name" value={id.lastName} onChange={(e) => set({ lastName: e.target.value })} />
      </div>
      <Input label="E-mail" type="email" autoComplete="email" placeholder="nom@exemple.fr" value={id.email} onChange={(e) => set({ email: e.target.value })} />

      {runners.data && runners.data.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MountainIcon className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">C’est toi sur UTMB ?</span>
          </div>
          <RadioCards
            aria-label="Profil UTMB"
            layout="list"
            value={answers.utmb?.uri ?? (answers.utmb === null ? 'none' : null)}
            onValueChange={pick}
            options={[
              ...runners.data.slice(0, 4).map((r) => ({
                value: r.uri,
                label: r.name,
                description: `${r.nationality} · ${r.ageGroup}`,
                meta: (
                  <span className="flex items-center gap-2">
                    {r.index ? <Badge size="sm">Index {r.index}</Badge> : null}
                    <Avatar name={r.name} src={r.picture ?? undefined} size="sm" />
                  </span>
                ),
              })),
              { value: 'none', label: 'Ce n’est pas moi', description: 'Ou je ne fais pas de trail.' },
            ]}
          />
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Course sur route : l’index running FFA n’est pas encore relié. Tu pourras ajouter un chrono récent à l’étape d’estimation.
      </p>
    </>
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

function GoalStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const goal = answers.goal ?? { type: '', terrain: 'road' as const, race: null, date: null }
  const set = (p: Partial<typeof goal>) => patch({ goal: { ...goal, ...p } })
  const [q, setQ] = useState('')
  const [dist, setDist] = useState('')
  const query = useDebounced(q, 300)
  const races = useQuery({
    queryKey: ['races', goal.terrain, dist, query],
    queryFn: () => api<Race[]>(`/lookup/races?type=${goal.terrain}&dist=${dist}&q=${encodeURIComponent(query)}`),
    enabled: goal.type === 'race',
    staleTime: 600_000,
  })
  const [custom, setCustom] = useState(false)
  const [customRace, setCustomRace] = useState({ name: '', km: 10, elevation: 0 })

  return (
    <>
      <Heading icon={TargetIcon} title="Quel est ton objectif ?" />
      <RadioCards aria-label="Objectif" layout="list" options={GOALS} value={goal.type || null} onValueChange={(type) => set({ type, race: null })} />

      {goal.type === 'distance' && (
        <ChipGroup
          label="Distance"
          multiple={false}
          options={MANUAL_DISTANCES}
          value={goal.race ? [String(goal.race.km)] : []}
          onValueChange={([v]) => set({ race: v ? { id: `distance:${v}`, name: MANUAL_DISTANCES.find((d) => d.value === v)!.label, detail: 'Distance visée', km: Number(v), elevation: 0, date: null, source: 'saisie' } : null })}
        />
      )}

      {goal.type === 'race' && (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            label="Terrain"
            options={[
              { value: 'road', label: 'Route' },
              { value: 'trail', label: 'Trail' },
            ]}
            value={goal.terrain}
            onValueChange={(v) => {
              setDist('')
              set({ terrain: v as 'road' | 'trail', race: null })
            }}
          />
          {!custom ? (
            <>
              <ChipGroup label="Distance" multiple={false} options={DIST_FILTERS[goal.terrain]} value={dist ? [dist] : []} onValueChange={([v]) => setDist(v ?? '')} />
              <SearchField label="Rechercher une course" placeholder={goal.terrain === 'trail' ? 'Ex. Grand Raid, Velay…' : 'Ex. Marathon de Paris'} value={q} onValueChange={setQ} />
              {races.data && races.data.length > 0 ? (
                <RadioCards
                  aria-label="Course"
                  layout="list"
                  value={goal.race?.id ?? null}
                  onValueChange={(id) => set({ race: races.data!.find((r) => r.id === id) ?? null })}
                  options={races.data.slice(0, 10).map((r) => ({
                    value: r.id,
                    label: r.name,
                    description: r.detail,
                    meta: r.date ? <span className="text-muted-foreground text-xs">{r.date}</span> : undefined,
                  }))}
                />
              ) : (
                races.isFetched && <EmptyState title="Aucune course trouvée" description="Essaie un autre nom, ou saisis ta course." />
              )}
              <Button type="button" variant="secondary" onClick={() => setCustom(true)}>
                <PlusIcon className="size-4" /> Ma course n’est pas dans la liste
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-4 rounded-[26px] border bg-card p-5">
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
          {goal.race && <p className="text-sm">Course choisie : <strong className="font-medium">{goal.race.name}</strong> · {goal.race.detail}</p>}
          <DatePicker
            label="Date de la course"
            locale="fr-FR"
            placeholder="Choisir la date"
            minDate={new Date()}
            value={goal.date ? new Date(`${goal.date}T12:00:00`) : undefined}
            onChange={(d) => set({ date: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null })}
          />
        </div>
      )}
    </>
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
  const perfs = [...manual, ...utmbPerfs]
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
      <Heading
        icon={GaugeIcon}
        title={race ? `Ton temps estimé sur ${race.name}` : 'Ton niveau actuel'}
        text={race ? 'Calculé à partir de tes résultats récents. Ajuste-le si tu vises plus vite ou plus prudent.' : 'Donne-nous un chrono récent : il sert à calibrer tes allures.'}
      />

      {uri && profile.isPending && <TextShimmer as="p" className="text-sm">Lecture de tes résultats UTMB…</TextShimmer>}

      {race && prediction && target && (
        <div className="flex flex-col gap-6 rounded-[34px] border bg-card p-6">
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

function HealthStep({ answers, patch }: { answers: CompleteAnswers; patch: (p: Partial<CompleteAnswers>) => void }) {
  const h = answers.health ?? { pains: [], painLevel: 0, events: [], weeklyKm: 20, notes: '' }
  const set = (p: Partial<typeof h>) => patch({ health: { ...h, ...p } })
  return (
    <>
      <Heading icon={HeartPulseIcon} title="Comment va ton corps ?" text="Ça nous aide à doser la charge des premières semaines." />
      <NumberField label="Kilomètres par semaine en ce moment" value={h.weeklyKm} min={0} max={200} suffix=" km" locale="fr-FR" onValueChange={(weeklyKm) => set({ weeklyKm })} />
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Des problèmes récents ?</h2>
        <p className="text-muted-foreground text-sm">Touche les zones qui t’ont gêné ces dernières semaines.</p>
      </div>
      <ChipGroup label="Des douleurs ces dernières semaines ?" options={PAINS} value={h.pains} onValueChange={(pains) => set({ pains, painLevel: pains.length ? h.painLevel : 0 })} />
      {h.pains.length > 0 && (
        <Rating label="Intensité de la gêne" max={5} value={h.painLevel} onChange={(painLevel) => set({ painLevel })} valueLabels={['Légère', 'Gênante', 'Modérée', 'Forte', 'Très forte']} emptyLabel="Non renseignée" />
      )}
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Quelque chose de récent ?</h2>
        <p className="text-muted-foreground text-sm">Blessure, maladie, pause, période chargée…</p>
      </div>
      <ChipGroup label="Quelque chose de récent ?" options={EVENTS} value={h.events} onValueChange={(events) => set({ events })} />
      <Textarea label="À nous dire (facultatif)" placeholder="Ex. entorse en mars, je reprends doucement" rows={3} value={h.notes} onChange={(e) => set({ notes: e.target.value })} />
      {(h.painLevel >= 4 || h.events.includes('surgery')) && (
        <p className="rounded-[20px] border border-[var(--warning)] p-4 text-sm">
          Avec une douleur forte ou une opération récente, demande l’avis d’un médecin avant de reprendre l’entraînement. Ton plan démarrera de façon très progressive.
        </p>
      )}
    </>
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
      <Heading icon={FootprintsIcon} title="Tes chaussures" text="Pour suivre l’usure et te prévenir quand une paire arrive en fin de vie." />
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

  const race = answers.goal?.race
  return (
    <div className="flex flex-col gap-8">
      <Heading icon={CalendarCheckIcon} title={finished ? 'Ta demande est prête' : 'On construit ton plan'} text={race ? `${race.name}${answers.goal?.date ? ` · ${new Date(`${answers.goal.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}` : undefined} />
      <Progress value={Math.min(current, BUILD.length)} max={BUILD.length} label={finished ? 'Terminé' : BUILD[Math.min(current, BUILD.length - 1)].label} showValue />
      <Stepper steps={BUILD} current={current} orientation="vertical" details="current" label="Génération du plan" completeLabel="Plan prêt" />
      {!finished && <TextShimmer as="p" className="text-muted-foreground text-sm">{`${BUILD[Math.min(current, BUILD.length - 1)].label}…`}</TextShimmer>}
      {finished && preview && <pre className="max-h-72 overflow-auto rounded-[20px] border bg-card p-4 text-xs">{JSON.stringify(answers, null, 2)}</pre>}
    </div>
  )
}
