import { useMutation } from '@tanstack/react-query'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { Activity, ChevronLeft, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { CourseCard } from '@/components/CourseCard'
import { Input } from '@/components/ui/input'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { WEEKDAYS, WEEKDAYS_SHORT, addDays, planWeeks, today } from '@/lib/coach/dates'
import { formatClock, formatPace, parseClock } from '@/lib/coach/format'
import { extractProfile, generatePlan, type Progress } from '@/lib/coach/generate'
import { DISTANCES, type Goal, type GoalDistance, type Profile } from '@/lib/coach/schema'
import { bestVdot, thresholdPace } from '@/lib/coach/vdot'
import { computeVolume } from '@/lib/coach/volume'
import { zonesFromThreshold } from '@/lib/coach/zones'
import { normalizeActivities } from '@/lib/coros/activities'
import { mergeRecords } from '@/lib/coach/records'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { fetchProfileData, fetchRecords } from '@/lib/coros/data'
import { usePlan } from '@/lib/store/plan'

const PREDICTION_KEY: Partial<Record<GoalDistance, keyof Profile['predictions']>> = {
  '5k': 'fiveK',
  '10k': 'tenK',
  half: 'half',
  marathon: 'marathon',
}

const DEFAULT_GOAL: Goal = {
  distance: '10k',
  courseKm: null,
  elevationGain: null,
  terrain: 'road',
  course: null,
  currentWeeklyKm: null,
  raceDate: addDays(today(), 70),
  targetTime: null,
  level: 'intermediate',
  days: [1, 3, 5, 6],
  longRunDay: 6,
  strength: false,
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const store = usePlan()
  const connected = useCorosAuth((s) => s.connected)
  const [goal, setGoal] = useState<Goal>({ ...DEFAULT_GOAL, ...store.goal })
  const [targetText, setTargetText] = useState(goal.targetTime ? formatClock(goal.targetTime) : '')
  const [progress, setProgress] = useState<Progress | null>(null)

  const update = (patch: Partial<Goal>) => setGoal((g) => ({ ...g, ...patch }))
  const weeks = planWeeks(goal.raceDate)
  const prediction = PREDICTION_KEY[goal.distance] && store.profile?.predictions[PREDICTION_KEY[goal.distance]!]

  const readCoros = useMutation({
    mutationFn: async () => {
      const [raw, records] = await Promise.all([fetchProfileData(), fetchRecords().catch(() => [])])
      const volume = computeVolume(normalizeActivities(raw.querySportRecords))
      const profile = await extractProfile(raw)
      return { profile: { ...profile, weeklyKm: volume.avg4w || profile.weeklyKm }, volume, records }
    },
    onSuccess: ({ profile, volume, records }) => {
      store.setProfile(profile)
      store.setVolume(volume)
      if (records.length > 0) store.setRecords(mergeRecords(store.records, records))
      const threshold = profile.thresholdPace ?? (records.length ? thresholdPace(bestVdot(records)!) : null)
      if (threshold) store.setZones(zonesFromThreshold(threshold))
      if (volume.avg4w > 0) update({ currentWeeklyKm: Math.round(Math.max(volume.avg4w, volume.lastMonthWeekly)) })
    },
  })

  const generate = useMutation({
    mutationFn: async () => {
      const final = { ...goal, targetTime: targetText.trim() ? parseClock(targetText) : null }
      store.setGoal(final)
      return generatePlan(final, store.profile, store.zones, setProgress, store.records)
    },
    onSuccess: (plan) => {
      store.setPlan(plan)
      navigate('/plan')
    },
    onSettled: () => setProgress(null),
  })

  const toggleDay = (d: number) => {
    const days = goal.days.includes(d) ? goal.days.filter((x) => x !== d) : [...goal.days, d].sort()
    update({ days, longRunDay: days.includes(goal.longRunDay) ? goal.longRunDay : (days[days.length - 1] ?? 6) })
  }

  const targetOk = targetText.trim() === '' || parseClock(targetText) !== null
  const canGenerate = goal.days.length >= 2 && !weeks.error && targetOk && !!goal.currentWeeklyKm

  if (generate.isPending && progress) {
    return (
      <div className="flex min-h-[70dvh] flex-col justify-center px-2">
        <Sparkles className="size-10 text-accent" />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Ton plan se construit</h1>
        <TextShimmer as="p" className="mt-2 text-lg font-medium">{`${progress.step}…`}</TextShimmer>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700"
            style={{ width: `${Math.max(8, (progress.done / progress.total) * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Compte une à deux minutes. Garde l’app ouverte.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-center gap-2 pt-4">
        <Link to="/" aria-label="Retour" className="-ml-2 p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Mon objectif</h1>
      </header>

      <Card>
        <div className="flex items-center gap-3">
          <Activity className="size-6 text-accent" />
          <div className="flex-1">
            <CardTitle>Mes données COROS</CardTitle>
            <CardDescription>Allures, prédictions et volume récent pour calibrer le plan.</CardDescription>
          </div>
        </div>
        {store.profile && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Allure seuil" value={store.profile.thresholdPace ? `${formatPace(store.profile.thresholdPace)} /km` : '—'} />
            <Stat label="VO2max" value={store.profile.vo2max ? String(store.profile.vo2max) : '—'} />
            <Stat label="Volume 4 sem." value={store.volume ? `${store.volume.avg4w} km/sem` : '—'} />
            <Stat label="Plus longue sortie" value={store.profile.longestRunKm != null ? `${store.profile.longestRunKm} km` : '—'} />
            <p className="col-span-2 text-muted-foreground">{store.profile.notes}</p>
          </dl>
        )}
        <Button
          variant="secondary"
          className="mt-4 w-full"
          disabled={!connected || readCoros.isPending}
          onClick={() => readCoros.mutate()}
        >
          {readCoros.isPending ? <TextShimmer>Lecture de tes données…</TextShimmer> : store.profile ? 'Relire mes données' : 'Lire mes données COROS'}
        </Button>
        {!connected && <p className="mt-2 text-xs text-muted-foreground">Connecte COROS dans Réglages.</p>}
        {readCoros.error && <p className="mt-2 text-sm text-destructive">{claudeErrorMessage(readCoros.error)}</p>}
      </Card>

      <Card className="space-y-5">
        <Field label="Distance">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DISTANCES) as GoalDistance[]).map((d) => (
              <Chip key={d} active={goal.distance === d} onClick={() => update({ distance: d })}>
                {DISTANCES[d]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Volume actuel (km par semaine)">
          <Input
            inputMode="numeric"
            placeholder="ex. 32"
            value={goal.currentWeeklyKm ?? ''}
            onChange={(e) => update({ currentWeeklyKm: Number(e.target.value.replace(',', '.')) || null })}
          />
          <p className="mt-1.5 text-sm text-muted-foreground">
            {store.volume
              ? `COROS : ${store.volume.avg4w} km/sem sur 4 semaines · mois dernier ${store.volume.lastMonthKm} km (${store.volume.lastMonthWeekly} km/sem) · ce mois-ci ${store.volume.thisMonthKm} km.`
              : 'Le plan démarre de ce volume. « Lire mes données COROS » le calcule pour toi.'}
          </p>
        </Field>

        <Field label="Date de course">
          <Input type="date" min={addDays(today(), 28)} value={goal.raceDate} onChange={(e) => update({ raceDate: e.target.value })} />
          <p className={weeks.error ? 'mt-1.5 text-sm text-destructive' : 'mt-1.5 text-sm text-muted-foreground'}>
            {weeks.error ?? `Plan de ${weeks.weeks.length} semaines à partir du ${weeks.start}.`}
          </p>
        </Field>

        <Field label="Temps visé (h:mm:ss, facultatif)">
          <Input inputMode="numeric" placeholder={prediction ? formatClock(prediction) : '0:50:00'} value={targetText} onChange={(e) => setTargetText(e.target.value)} />
          {prediction && (
            <button type="button" className="mt-1.5 text-sm font-medium text-accent" onClick={() => setTargetText(formatClock(prediction))}>
              Prédiction COROS : {formatClock(prediction)} — utiliser
            </button>
          )}
        </Field>

        <Field label="Niveau">
          <div className="grid grid-cols-3 gap-2">
            {(['beginner', 'intermediate', 'advanced'] as const).map((l) => (
              <Chip key={l} active={goal.level === l} onClick={() => update({ level: l })} className="px-2">
                {{ beginner: 'Débutant', intermediate: 'Inter.', advanced: 'Confirmé' }[l]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label={`Jours disponibles (${goal.days.length})`}>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS_SHORT.map((d, i) => (
              <Chip key={i} active={goal.days.includes(i)} onClick={() => toggleDay(i)} className="px-0" aria-label={WEEKDAYS[i]}>
                {d}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Sortie longue le">
          <div className="flex flex-wrap gap-2">
            {goal.days.map((d) => (
              <Chip key={d} active={goal.longRunDay === d} onClick={() => update({ longRunDay: d })}>
                {WEEKDAYS[d]}
              </Chip>
            ))}
          </div>
        </Field>

        <label className="flex items-center justify-between gap-4">
          <span className="font-medium">Séance de renforcement</span>
          <input type="checkbox" className="size-6 accent-[var(--accent)]" checked={goal.strength} onChange={(e) => update({ strength: e.target.checked })} />
        </label>
      </Card>

      <CourseCard goal={goal} update={update} />

      {generate.error && <Card className="text-sm text-destructive whitespace-pre-line">{claudeErrorMessage(generate.error)}</Card>}
      {!goal.currentWeeklyKm && <p className="text-center text-sm text-muted-foreground">Indique ton volume actuel pour générer le plan.</p>}

      <Button className="w-full" disabled={!canGenerate || generate.isPending} onClick={() => generate.mutate()}>
        <Sparkles className="size-5" />
        {store.plan ? 'Régénérer mon plan' : 'Générer mon plan'}
      </Button>
      {store.plan && <p className="text-center text-xs text-muted-foreground">Le plan actuel sera remplacé.</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  )
}
