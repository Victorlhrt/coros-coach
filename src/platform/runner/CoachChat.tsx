import { useMutation } from '@tanstack/react-query'
import { ArrowUp, CalendarDays, Check, Gauge, HeartPulse, Loader2, Route, Sparkles, Timer, Wand2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/shadcn/button'
import { formatDay, today } from '@/lib/coach/dates'
import { formatDistance, formatDuration, formatPace } from '@/lib/coach/format'
import { sessionTotals } from '@/lib/coach/metrics'
import { ROUTES } from '@/lib/coach/routes'
import type { Session } from '@/lib/coach/schema'
import { PHASE_LABEL } from '@/lib/coach/ui'
import { ZONE_NAMES } from '@/lib/coach/zones'
import { pushDays } from '@/lib/coros/sync'
import { allSessions, usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { CoachAvatar } from '../onboarding/CoachAvatar'
import { currentWeek, isDone } from './coach-data'

/**
 * Pacer, en fenêtre de chat. Le coach conversationnel n'est pas encore branché : les réponses sont écrites
 * à l'avance et calculées sur le plan du coureur, sans appel à l'IA (aucun token dépensé). Chaque réponse
 * montre d'abord ce que Pacer a « consulté », façon appel d'outil, puis le message.
 */

type Step = { icon: ReactNode; label: string; meta?: string }
type Reply = { steps: Step[]; text: ReactNode; review?: boolean }
type Message = { id: number; from: 'me' | 'pacer'; text?: ReactNode; steps?: Step[]; review?: boolean }
type Intent = { id: string; chip: string; match: RegExp; reply: () => Reply }

const sessionLine = (s: Session) => {
  const { zones } = usePlan.getState()
  const units = useSettings.getState().units
  const t = sessionTotals(s, zones)
  return `${s.title} · ${formatDuration(t.seconds)}${t.meters > 0 ? ` · ${formatDistance(t.meters, units)}` : ''}`
}

const INTENTS: Intent[] = [
  {
    id: 'today',
    chip: 'What’s my session today?',
    match: /today|aujourd|session du jour|séance du jour|what.*(run|do)/i,
    reply: () => {
      const { plan } = usePlan.getState()
      const now = today()
      const todays = plan ? allSessions(plan).filter((s) => s.date === now) : []
      const next = plan ? allSessions(plan).find((s) => s.date > now) : undefined
      return {
        steps: [{ icon: <CalendarDays />, label: 'Read today in your plan', meta: formatDay(now, { weekday: 'short', day: 'numeric', month: 'short' }) }],
        text: todays.length ? (
          <>
            Today is <strong>{todays.map((s) => s.title).join(' + ')}</strong>.{' '}
            {todays.map((s) => (
              <span key={s.id} className="block text-muted-foreground">
                {sessionLine(s)}
                {s.description ? ` — ${s.description}` : ''}
              </span>
            ))}
          </>
        ) : (
          <>
            Today is a <strong>rest day</strong>. Recovery is part of training.
            {next && (
              <span className="block text-muted-foreground">
                Next up, {formatDay(next.date, { weekday: 'long' })}: {sessionLine(next)}.
              </span>
            )}
          </>
        ),
      }
    },
  },
  {
    id: 'week',
    chip: 'How’s my week going?',
    match: /week|semaine|progress|on track/i,
    reply: () => {
      const { plan, links, feedback, zones } = usePlan.getState()
      const units = useSettings.getState().units
      const now = today()
      const week = plan ? currentWeek(plan, now) : undefined
      if (!week) return { steps: [{ icon: <CalendarDays />, label: 'Looked for this week in your plan', meta: 'not found' }], text: 'Your plan hasn’t started yet, or it’s already over.' }
      const done = week.sessions.filter((s) => isDone(s, links, feedback))
      const left = week.sessions.filter((s) => s.date >= now && !isDone(s, links, feedback))
      const missed = week.sessions.filter((s) => s.date < now && !isDone(s, links, feedback))
      const planned = week.sessions.reduce((a, s) => a + sessionTotals(s, zones).meters, 0)
      return {
        steps: [
          { icon: <CalendarDays />, label: `Read week ${week.number} of your plan`, meta: `${week.sessions.length} sessions` },
          { icon: <Check />, label: 'Matched your COROS activities', meta: `${done.length} done` },
        ],
        text: (
          <>
            Week {week.number} ({PHASE_LABEL[week.phase].toLowerCase()} phase): <strong>{done.length} of {week.sessions.length}</strong> sessions done,{' '}
            {formatDistance(planned, units, 0)} planned.
            {missed.length > 0 && <span className="block">Missed so far: {missed.map((s) => s.title).join(', ')}. No need to make it up, just carry on.</span>}
            {left.length > 0 && <span className="block text-muted-foreground">Still to come: {left.map((s) => `${formatDay(s.date, { weekday: 'short' })} ${s.title}`).join(' · ')}.</span>}
          </>
        ),
      }
    },
  },
  {
    id: 'quality',
    chip: 'When is my next hard session?',
    match: /hard|interval|fractionn|vma|tempo|seuil|threshold|quality|speed/i,
    reply: () => {
      const { plan } = usePlan.getState()
      const now = today()
      const next = plan ? allSessions(plan).find((s) => s.date >= now && ['interval', 'tempo', 'race'].includes(s.type)) : undefined
      return {
        steps: [{ icon: <Gauge />, label: 'Searched upcoming intervals and tempo runs', meta: next ? '1 found' : 'none' }],
        text: next ? (
          <>
            Your next quality session is <strong>{formatDay(next.date, { weekday: 'long', day: 'numeric', month: 'short' })}</strong>: {sessionLine(next)}.
            <span className="block text-muted-foreground">Keep the day before easy and warm up properly: 10 to 15 minutes, then a few strides.</span>
          </>
        ) : (
          'No hard session left in your plan. Enjoy the easy miles.'
        ),
      }
    },
  },
  {
    id: 'race',
    chip: 'How long until race day?',
    match: /race|course|jour j|countdown|goal|objectif|target/i,
    reply: () => {
      const { plan, goal } = usePlan.getState()
      const units = useSettings.getState().units
      if (!plan) return { steps: [], text: 'You don’t have a plan yet.' }
      const days = Math.max(0, Math.round((Date.parse(plan.raceDate) - Date.parse(today())) / 86_400_000))
      const km = goal?.courseKm ?? ({ '5k': 5, '10k': 10, half: 21.0975, marathon: 42.195 } as Record<string, number>)[goal?.distance ?? '']
      return {
        steps: [{ icon: <Route />, label: 'Read your goal', meta: formatDay(plan.raceDate, { day: 'numeric', month: 'short' }) }],
        text: (
          <>
            <strong>{days === 0 ? 'It’s race day!' : `${days} days`}</strong> to go until {plan.name} on {formatDay(plan.raceDate, { weekday: 'long', day: 'numeric', month: 'long' })}.
            {goal?.targetTime && (
              <span className="block text-muted-foreground">
                Target: {formatDuration(goal.targetTime)}
                {km ? `, about ${formatPace(goal.targetTime / km, units)} on average` : ''}.
              </span>
            )}
          </>
        ),
      }
    },
  },
  {
    id: 'zones',
    chip: 'What are my pace zones?',
    match: /zone|pace|allure|speed/i,
    reply: () => {
      const { zones } = usePlan.getState()
      const units = useSettings.getState().units
      return {
        steps: [{ icon: <Timer />, label: 'Read your pace zones', meta: `${zones.length} zones` }],
        text: (
          <>
            Here are your zones:
            <span className="mt-2 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 text-sm">
              {zones.map((z) => (
                <span key={z.zone} className="contents">
                  <span className="font-medium">Z{z.zone}</span>
                  <span className="text-muted-foreground">{ZONE_NAMES[z.zone] ?? z.name}</span>
                  <span className="tabular-nums">
                    {formatPace(z.paceFast, units)}–{formatPace(z.paceSlow, units)}
                  </span>
                </span>
              ))}
            </span>
          </>
        ),
      }
    },
  },
  {
    id: 'pain',
    chip: 'Something hurts',
    match: /hurt|pain|sore|mal|douleur|injur|bless|calf|mollet|knee|genou/i,
    reply: () => ({
      steps: [{ icon: <HeartPulse />, label: 'Checked your recent feedback' }],
      text: (
        <>
          Sorry to hear that. A simple rule: if the pain changes how you run, or gets worse as you go, stop and take two or three easy days or rest.
          <span className="block">Swap hard sessions for easy ones until it’s gone, and see a physio if it lasts more than a week.</span>
          <span className="block text-muted-foreground">Soon you’ll tell me here and I’ll lighten the plan for you.</span>
        </>
      ),
    }),
  },
  {
    id: 'review',
    chip: 'Show my weekly review',
    match: /review|bilan|adjust|ajust|analy/i,
    reply: () => {
      const { plan, reviews } = usePlan.getState()
      const week = plan ? currentWeek(plan, today()) : undefined
      const review = week ? reviews[week.number] : undefined
      if (!review)
        return {
          steps: [{ icon: <Wand2 />, label: 'Looked for this week’s review', meta: 'not ready' }],
          text: 'Your review isn’t ready yet. I analyse your week automatically the first time you open the app each week, then suggest changes here.',
        }
      return {
        steps: [{ icon: <Wand2 />, label: `Opened your week ${week!.number} review`, meta: `${review.adjustment.changes.length} change${review.adjustment.changes.length === 1 ? '' : 's'}` }],
        text: review.adjustment.summary,
        review: true,
      }
    },
  },
  {
    id: 'move',
    chip: 'Can I move a session?',
    match: /move|déplac|decal|décal|swap|reschedul|busy|chargé/i,
    reply: () => ({
      steps: [{ icon: <CalendarDays />, label: 'Checked your schedule' }],
      text: (
        <>
          Soon you’ll just tell me and I’ll move it and resync your watch.
          <span className="block text-muted-foreground">Until then, a good rule: never put two hard days back to back, and keep the long run on its day if you can.</span>
        </>
      ),
    }),
  },
]

const FALLBACK: Reply = {
  steps: [],
  text: 'I can’t answer free questions yet, the full chat is coming soon. Here’s what I can already help with:',
}

let nextId = 1

export function CoachChat({ firstName, className }: { firstName?: string; className?: string }) {
  const reduce = useReducedMotion()
  const plan = usePlan((s) => s.plan)
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: nextId++,
      from: 'pacer',
      text: `Hi${firstName ? ` ${firstName}` : ''}! I’m Pacer, your coach. ${plan ? `We’re working towards ${plan.name}.` : 'Your plan is on its way.'} Ask me about your plan:`,
    },
  ])
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [messages, busy, reduce])

  function ask(question: string, intent?: Intent) {
    if (busy || !question.trim()) return
    const found = intent ?? INTENTS.find((i) => i.match.test(question))
    setMessages((m) => [...m, { id: nextId++, from: 'me', text: question.trim() }])
    setDraft('')
    setBusy(true)
    window.setTimeout(
      () => {
        const r = found ? found.reply() : FALLBACK
        setMessages((m) => [...m, { id: nextId++, from: 'pacer', steps: r.steps, text: r.text, review: r.review }])
        setBusy(false)
      },
      reduce ? 150 : 700 + Math.random() * 400,
    )
  }

  const asked = new Set(messages.filter((m) => m.from === 'me').map((m) => String(m.text)))
  const chips = INTENTS.filter((i) => !asked.has(i.chip))

  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-[28px] border bg-card', className)}>
      <header className="flex items-center gap-3 border-b px-5 py-3.5">
        <CoachAvatar className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Pacer</p>
        </div>
        <Badge size="sm" tone="info" icon={<Sparkles className="size-3" />}>
          Full chat soon
        </Badge>
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-8" aria-live="polite">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={m.from === 'me' ? 'flex justify-end' : 'flex flex-col gap-3'}
            >
              {m.from === 'me' ? (
                <p className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground/[0.08] px-4 py-2.5 text-[15px]">{m.text}</p>
              ) : (
                <>
                  {m.steps && m.steps.length > 0 && <ToolCard steps={m.steps} />}
                  <div className="max-w-[46rem] text-[15px] leading-relaxed [&_.block]:mt-1.5">{m.text}</div>
                  {m.review && <ReviewActions />}
                </>
              )}
            </motion.div>
          ))}
          {busy && (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ToolCard running steps={[{ icon: <Loader2 className="animate-spin" />, label: 'Looking at your plan…' }]} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="border-t px-4 pt-3 pb-4 sm:px-6">
        {chips.length > 0 && (
          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {chips.map((i) => (
              <button
                key={i.id}
                type="button"
                disabled={busy}
                onClick={() => ask(i.chip, i)}
                className="shrink-0 rounded-full border bg-background px-3.5 py-1.5 text-sm transition-colors hover:border-foreground/30 hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                {i.chip}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-2 rounded-[20px] border bg-background p-1.5 pl-4 focus-within:ring-2 focus-within:ring-ring"
          onSubmit={(e) => {
            e.preventDefault()
            ask(draft)
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Pacer about your plan…" aria-label="Message Pacer" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
          <button type="submit" disabled={!draft.trim() || busy} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30">
            <ArrowUp className="size-4" />
          </button>
        </form>
      </footer>
    </section>
  )
}

/** Carte « appel d'outil » façon Arc : ce que Pacer a consulté, une ligne par étape, coche à droite. */
function ToolCard({ steps, running }: { steps: Step[]; running?: boolean }) {
  return (
    <div className="max-w-[34rem] overflow-hidden rounded-2xl border bg-background">
      {steps.length > 1 && (
        <p className="border-b px-4 py-2 text-muted-foreground text-xs">
          Used {steps.length} tools
        </p>
      )}
      <ul className="divide-y">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground [&>svg]:size-3.5">{s.icon}</span>
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            {s.meta && <span className="shrink-0 text-muted-foreground text-xs">{s.meta}</span>}
            {!running && <Check className="size-4 shrink-0 text-emerald-400" aria-label="Done" />}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ajustements du bilan de la semaine : appliqués d'un clic (le bilan est déjà calculé, aucun appel à l'IA ici). */
function ReviewActions() {
  const navigate = useNavigate()
  const store = usePlan()
  const now = today()
  const week = store.plan ? currentWeek(store.plan, now) : undefined
  const review = week ? store.reviews[week.number] : undefined
  const apply = useMutation({
    mutationFn: async () => {
      if (!review || !week) return 'local'
      store.applyChanges(review.adjustment.changes)
      store.setReviewStatus(week.number, 'applied')
      const { plan, coros } = usePlan.getState()
      const dates = review.adjustment.changes.map((c) => c.date)
      if (!coros.created || !plan || dates.length === 0) return 'local'
      return (await pushDays(plan, dates, 'the adjusted sessions')) ? 'sent' : 'local'
    },
    onSuccess: (r) => {
      toast.success(r === 'sent' ? 'Week adjusted and sent to your watch ✓' : 'Week adjusted in the app')
      navigate(ROUTES.plan)
    },
    onError: (e) => toast.error(e),
  })
  if (!review || !week) return null
  const changes = review.adjustment.changes
  const label = { replace: 'Change', remove: 'Remove', add: 'Add' } as const
  return (
    <div className="flex max-w-[34rem] flex-col gap-3">
      {changes.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-background">
          {changes.map((c, i) => (
            <li key={i} className="px-4 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                {label[c.action]} · {formatDay(c.date, { weekday: 'short', day: 'numeric' })}
              </span>
              <span className="block font-medium">{c.session ? c.session.title : 'Rest day'}</span>
              {c.reason && <span className="block text-muted-foreground text-xs">{c.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      {review.status === 'pending' && changes.length > 0 ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => apply.mutate()} disabled={apply.isPending}>
            Apply {changes.length} change{changes.length > 1 ? 's' : ''}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => store.setReviewStatus(week.number, 'dismissed')}>
            Not now
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {review.status === 'applied' ? 'Already applied to your plan.' : review.status === 'dismissed' ? 'You dismissed these changes.' : ''} Reviewed{' '}
          {formatDay(review.createdAt.slice(0, 10), { weekday: 'long' })}.
        </p>
      )}
    </div>
  )
}
