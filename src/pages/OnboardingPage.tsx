import { useMutation } from '@tanstack/react-query'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { Activity, ChevronLeft, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { CourseCard } from '@/components/CourseCard'
import { Input } from '@/components/ui/input'
import { claudeErrorMessage } from '@/lib/coach/claude'
import { WEEKDAYS, WEEKDAYS_SHORT, addDays, planWeeks, today } from '@/lib/coach/dates'
import { formatClock, formatPace, parseClock } from '@/lib/coach/format'
import { clearDraft, extractProfile, generatePlan, isGenerating, loadDraft, markDraftFailed, type PlanDraft, type Progress } from '@/lib/coach/generate'
import { DISTANCES, type Goal, type GoalDistance, type Profile } from '@/lib/coach/schema'
import { bestVdot, thresholdPace } from '@/lib/coach/vdot'
import { computeVolume } from '@/lib/coach/volume'
import { zonesFromThreshold } from '@/lib/coach/zones'
import { normalizeActivities } from '@/lib/coros/activities'
import { mergeRecords } from '@/lib/coach/records'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { fetchProfileData, fetchRecords } from '@/lib/coros/data'
import { usePlan } from '@/lib/store/plan'
import { ROUTES } from '@/lib/coach/routes'

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
    mutationFn: async (resume: PlanDraft | null) => {
      const final = resume?.goal ?? { ...goal, targetTime: targetText.trim() ? parseClock(targetText) : null }
      // Même objectif qu'une génération qui a échoué : on garde les étapes déjà réussies.
      const previous = loadDraft()
      if (!resume && previous && JSON.stringify(previous.goal) === JSON.stringify(final)) resume = previous
      store.setGoal(final)
      return generatePlan(final, store.profile, store.zones, setProgress, store.records, resume)
    },
    onSuccess: (plan) => {
      clearDraft()
      store.setPlan(plan)
      navigate(ROUTES.plan)
    },
    onError: () => markDraftFailed(),
    onSettled: () => setProgress(null),
  })

  // Une génération interrompue par un rechargement reprend là où elle s'était arrêtée.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    const draft = loadDraft()
    if (draft && !draft.failed && !isGenerating()) generate.mutate(draft)
  }, [generate])

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
        <h1 className="mt-4 text-3xl font-medium tracking-tight">Building your plan</h1>
        <TextShimmer as="p" className="mt-2 text-lg font-medium">{`${progress.step}…`}</TextShimmer>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700"
            style={{ width: `${Math.max(8, (progress.done / progress.total) * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Takes less than a minute. If the app reloads, generation picks up where it left off.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 pb-6 lg:grid-cols-2">
      <header className="flex items-center gap-2 pt-4 lg:col-span-2">
        <Link to={ROUTES.today} aria-label="Back" className="-ml-2 p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="font-heading text-2xl font-medium tracking-tight">My goal</h1>
      </header>

      <div className="flex flex-col gap-4 lg:[&>*:last-child]:flex-1">
      <Card>
        <div className="flex items-center gap-3">
          <Activity className="size-6 text-accent" />
          <div className="flex-1">
            <CardTitle>My COROS data</CardTitle>
            <CardDescription>Paces, predictions and recent volume to calibrate your plan.</CardDescription>
          </div>
        </div>
        {store.profile && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Threshold pace" value={store.profile.thresholdPace ? `${formatPace(store.profile.thresholdPace)} /km` : '—'} />
            <Stat label="VO2max" value={store.profile.vo2max ? String(store.profile.vo2max) : '—'} />
            <Stat label="4-week volume" value={store.volume ? `${store.volume.avg4w} km/wk` : '—'} />
            <Stat label="Longest run" value={store.profile.longestRunKm != null ? `${store.profile.longestRunKm} km` : '—'} />
            <p className="col-span-2 text-muted-foreground">{store.profile.notes}</p>
          </dl>
        )}
        <Button
          variant="secondary"
          className="mt-4 w-full"
          disabled={!connected || readCoros.isPending}
          onClick={() => readCoros.mutate()}
        >
          {readCoros.isPending ? <TextShimmer>Reading your data…</TextShimmer> : store.profile ? 'Re-read my data' : 'Read my COROS data'}
        </Button>
        {!connected && <p className="mt-2 text-xs text-muted-foreground">Connect COROS in Settings.</p>}
        {readCoros.error && <p className="mt-2 text-sm text-destructive">{claudeErrorMessage(readCoros.error)}</p>}
      </Card>
        <CourseCard goal={goal} update={update} />
      </div>

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

        <Field label="Current volume (km per week)">
          <Input
            inputMode="numeric"
            placeholder="e.g. 32"
            value={goal.currentWeeklyKm ?? ''}
            onChange={(e) => update({ currentWeeklyKm: Number(e.target.value.replace(',', '.')) || null })}
          />
          <p className="mt-1.5 text-sm text-muted-foreground">
            {store.volume
              ? `COROS: ${store.volume.avg4w} km/wk over 4 weeks · last month ${store.volume.lastMonthKm} km (${store.volume.lastMonthWeekly} km/wk) · this month ${store.volume.thisMonthKm} km.`
              : 'Your plan starts from this volume. “Read my COROS data” calculates it for you.'}
          </p>
        </Field>

        <Field label="Race date">
          <Input type="date" min={addDays(today(), 28)} value={goal.raceDate} onChange={(e) => update({ raceDate: e.target.value })} />
          <p className={weeks.error ? 'mt-1.5 text-sm text-destructive' : 'mt-1.5 text-sm text-muted-foreground'}>
            {weeks.error ?? `${weeks.weeks.length}-week plan starting ${weeks.start}.`}
          </p>
        </Field>

        <Field label="Target time (h:mm:ss, optional)">
          <Input inputMode="numeric" placeholder={prediction ? formatClock(prediction) : '0:50:00'} value={targetText} onChange={(e) => setTargetText(e.target.value)} />
          {prediction && (
            <button type="button" className="mt-1.5 text-sm font-medium text-accent" onClick={() => setTargetText(formatClock(prediction))}>
              COROS prediction: {formatClock(prediction)} — use it
            </button>
          )}
        </Field>

        <Field label="Level">
          <div className="grid grid-cols-3 gap-2">
            {(['beginner', 'intermediate', 'advanced'] as const).map((l) => (
              <Chip key={l} active={goal.level === l} onClick={() => update({ level: l })} className="px-2">
                {{ beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }[l]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label={`Available days (${goal.days.length})`}>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS_SHORT.map((d, i) => (
              <Chip key={i} active={goal.days.includes(i)} onClick={() => toggleDay(i)} className="px-0" aria-label={WEEKDAYS[i]}>
                {d}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Long run on">
          <div className="flex flex-wrap gap-2">
            {goal.days.map((d) => (
              <Chip key={d} active={goal.longRunDay === d} onClick={() => update({ longRunDay: d })}>
                {WEEKDAYS[d]}
              </Chip>
            ))}
          </div>
        </Field>

        <label className="flex items-center justify-between gap-4">
          <span className="font-medium">Strength session</span>
          <input type="checkbox" className="size-6 accent-[var(--accent)]" checked={goal.strength} onChange={(e) => update({ strength: e.target.checked })} />
        </label>
      </Card>

      {generate.error && <Card className="text-sm text-destructive whitespace-pre-line lg:col-span-2">{claudeErrorMessage(generate.error)}</Card>}
      {!goal.currentWeeklyKm && <p className="text-center text-sm text-muted-foreground lg:col-span-2">Enter your current volume to generate your plan.</p>}

      <Button className="w-full lg:col-span-2" disabled={!canGenerate || generate.isPending} onClick={() => generate.mutate(null)}>
        <Sparkles className="size-5" />
        {store.plan ? 'Regenerate my plan' : 'Generate my plan'}
      </Button>
      {store.plan && <p className="text-center text-xs text-muted-foreground lg:col-span-2">Your current plan will be replaced.</p>}
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
      <dd className="text-lg font-medium tabular-nums">{value}</dd>
    </div>
  )
}
