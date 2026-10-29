import {
  ArrowRightIcon,
  BotIcon,
  CalendarRangeIcon,
  CheckCheckIcon,
  FlagIcon,
  HeartPulseIcon,
  MessageCircleIcon,
  MountainIcon,
  RefreshCwIcon,
  TargetIcon,
  WatchIcon,
  ZapIcon,
} from 'lucide-react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { DecorIcon } from '@/components/decor-icon'
import { FullWidthDivider } from '@/components/full-width-divider'
import { Header } from '@/components/header'
import { HeroSection } from '@/components/hero'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { DotWordmark } from './DotWordmark'
import { CoachFlow, WatchFlow } from './landing-flows'
import { StepsTrack, type TrackStep } from './StepsTrack'
import { LogoIcon } from '@/components/logo'
import { Button } from '@/components/shadcn/button'
import { cn } from '@/lib/utils'
import { BRAND, appHref } from '../brand'

/** Fond « grille de points » des cartes : points discrets, fondus vers le bas. */
const DOT_GRID =
  'bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_16%,transparent)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent)]'

const STEPS: TrackStep[] = [
  { title: 'Connect your watch', text: 'Your history syncs in the background.', icon: <WatchIcon />, visual: <SyncVisual /> },
  { title: 'We find your results', text: 'Public race results set your real level.', icon: <MountainIcon />, visual: <ResultsVisual /> },
  { title: 'Pick your race', text: 'Get a predicted time you can tune.', icon: <TargetIcon />, visual: <TimeVisual /> },
  { title: 'Get your plan', text: 'Week by week, synced to your wrist.', icon: <CalendarRangeIcon />, visual: <WeeksVisual /> },
]

const FAQ = [
  { q: 'What is agentic running?', a: 'Instead of a fixed template, AI agents work for you: they read your watch data, build the plan, push sessions to your wrist and adjust every week. You stay in charge, they do the paperwork.' },
  { q: 'Which watches work?', a: 'COROS is connected today, with sessions sent directly to the watch. Garmin is next, then Apple Watch, Suunto and Polar.' },
  { q: 'Is it really personal?', a: 'Paces come from your own recent results, the volume from your current weeks, and the structure from your goal, your days and your body. No two plans look the same.' },
  { q: 'How much does it cost?', a: 'Plans are free during the beta. We’ll announce pricing before the beta ends.' },
]

export function LandingPage() {
  // La landing est en anglais ; l'application reste en français.
  useEffect(() => {
    const previous = document.documentElement.lang
    document.documentElement.lang = 'en'
    document.title = `${BRAND.name} · Agentic running`
    return () => {
      document.documentElement.lang = previous
    }
  }, [])

  return (
    <div className="min-h-dvh overflow-x-clip">
      <Header />
      <main className="mx-auto max-w-5xl">
        <HeroSection />

        <Section
          id="agentic"
          eyebrow="Agentic running"
          title={
            <>
              A coach that <span className="text-foreground">reads, plans and acts</span>
            </>
          }
        >
          <div className="grid gap-4 px-4 py-4 md:grid-cols-3 md:px-0">
            <Pillar icon={<WatchIcon />} title="Reads" text="Your watch and your race results, read for you." photo="/visuals/reads.webp" photoPosition="object-[65%_45%]" visual={<ReadsVisual />} />
            <Pillar icon={<BotIcon />} title="Plans" text="Every week written around your goal and your body." photo="/visuals/plans.webp" photoPosition="object-[50%_20%]" visual={<PlansVisual />} />
            <Pillar icon={<RefreshCwIcon />} title="Acts" text="Sessions on your wrist, rewritten from what you ran." photo="/visuals/acts.webp" photoPosition="object-[45%_8%]" visual={<ActsVisual />} />
          </div>
        </Section>

        <Section
          id="how-it-works"
          eyebrow="How it works"
          title={
            <>
              Four steps, <span className="text-foreground">two minutes</span>
            </>
          }
        >
          <StepsTrack steps={STEPS} />
        </Section>

        <Section
          id="watch"
          eyebrow="Watch sync"
          title={
            <>
              Every session, <span className="text-foreground">straight to your wrist</span>
            </>
          }
        >
          <FlowRow
            text="Sync your data, get your plan, run it from your wrist. Your run comes back on its own and shapes the next one."
            points={[
              { icon: <RefreshCwIcon />, label: 'History synced in the background' },
              { icon: <ZapIcon />, label: 'Structured workouts with target paces' },
              { icon: <CheckCheckIcon />, label: 'Runs matched to your plan automatically' },
            ]}
            visual={<WatchFlow />}
            media={<img alt="" loading="lazy" src="/visuals/watch.webp" className="mx-auto w-44 rotate-[-8deg] drop-shadow-2xl md:mx-0 md:w-52" />}
          />
        </Section>

        <Section
          id="coach"
          eyebrow="AI coach"
          title={
            <>
              Life happens. <span className="text-foreground">Your plan follows.</span>
            </>
          }
        >
          <FlowRow
            reverse
            text="Tell the coach what changed, in your own words. The week is rewritten around your schedule and your body."
            points={[
              { icon: <MessageCircleIcon />, label: 'Plain-language adjustments' },
              { icon: <HeartPulseIcon />, label: 'Fatigue and pain taken into account' },
              { icon: <FlagIcon />, label: 'Race-week taper built in' },
            ]}
            visual={<CoachFlow />}
            media={
              <div className="relative h-56 overflow-hidden rounded-xl border">
                <img alt="" loading="lazy" src="/visuals/coach.webp" className="absolute inset-0 size-full object-cover object-[50%_30%]" />
                <div className="absolute inset-0 bg-linear-to-t from-background/60 to-transparent" />
              </div>
            }
          />
        </Section>

        <Section id="faq" eyebrow="FAQ" title={<>Questions, <span className="text-foreground">answered</span></>}>
          <div className="grid border md:grid-cols-2">
            {FAQ.map((f, i) => (
              <div key={f.q} className={cn('flex flex-col gap-2 p-6', i % 2 === 0 && 'md:border-r', i < 2 && 'border-b')}>
                <h3 className="font-medium">{f.q}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </Section>

        <section className="relative isolate flex flex-col items-center gap-4 px-4 py-28 text-center md:py-36">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 -z-1 w-screen -translate-x-1/2 overflow-hidden">
            <img src="/visuals/cta.webp" alt="" loading="lazy" className="size-full object-cover object-[50%_60%] opacity-70" />
            <div className="absolute inset-0 bg-linear-to-b from-background via-transparent to-background" />
          </div>
          <h2 className="font-heading max-w-xl text-balance font-semibold text-2xl tracking-tight md:text-4xl">Two minutes of questions. A plan all the way to race day.</h2>
          <Button asChild size="lg">
            <a href={appHref('/onboarding')}>
              Build my plan <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pt-6 text-muted-foreground text-xs">
          <span>Agentic running: your plan, written by AI, synced to your watch.</span>
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
        </div>
        <div className="mx-auto hidden max-w-6xl px-4 pt-10 md:block">
          <DotWordmark />
        </div>
      </footer>
    </div>
  )
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="relative mt-20 scroll-mt-24" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col items-center gap-2 px-4 pb-8 text-center">
        <span className="text-muted-foreground text-xs uppercase tracking-widest">{eyebrow}</span>
        <h2 id={`${id}-title`} className="font-heading text-balance font-medium text-2xl text-muted-foreground tracking-tight md:text-3xl">
          {title}
        </h2>
      </div>
      <div className="relative">
        <DecorIcon className="size-4" position="top-left" />
        <DecorIcon className="size-4" position="top-right" />
        <DecorIcon className="size-4" position="bottom-left" />
        <DecorIcon className="size-4" position="bottom-right" />
        <FullWidthDivider className="-top-px" />
        {children}
        <FullWidthDivider className="-bottom-px" />
      </div>
    </section>
  )
}

/** Rangée façon Default : texte court (40 %) et flux animé de l'outil (60 %), sur la grille de points. */
function FlowRow({
  text,
  points,
  visual,
  reverse,
  media,
}: {
  text: string
  points: { icon: ReactNode; label: string }[]
  visual: ReactNode
  reverse?: boolean
  media?: ReactNode
}) {
  return (
    <div className={cn('grid border md:grid-cols-[2fr_3fr]', reverse && 'md:grid-cols-[3fr_2fr]')}>
      <div className={cn('flex flex-col justify-center gap-6 border-b p-6 md:border-b-0 md:p-10', reverse ? 'md:order-2 md:border-l' : 'md:border-r')}>
        {media && <div aria-hidden="true">{media}</div>}
        <p className="text-lg leading-relaxed">{text}</p>
        <ul className="flex flex-col gap-3 text-sm">
          {points.map((p) => (
            <li key={p.label} className="flex items-center gap-3 text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card text-foreground [&>svg]:size-4">{p.icon}</span>
              {p.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex items-center justify-center overflow-hidden p-6 md:p-10">
        <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', DOT_GRID)} />
        <div className="relative w-full max-w-md">{visual}</div>
      </div>
    </div>
  )
}

/** Un pilier = une seule carte : l'aperçu de l'outil en haut, puis l'icône, le titre et la phrase. */
function Pillar({ icon, title, text, photo, photoPosition, visual }: { icon: ReactNode; title: string; text: string; photo: string; photoPosition: string; visual: ReactNode }) {
  return (
    <div className="group/pillar flex flex-col overflow-hidden rounded-2xl border bg-card/40">
      <div className="relative flex h-80 items-end justify-center overflow-hidden border-b px-5 pb-5">
        <img
          alt=""
          loading="lazy"
          src={photo}
          className={cn('absolute inset-x-0 top-0 h-3/4 w-full object-cover opacity-70 transition-transform duration-700 ease-out group-hover/pillar:scale-105', photoPosition)}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-card via-card/70 via-45% to-transparent" />
        <div className="relative w-full">{visual}</div>
      </div>
      <div className="flex flex-col gap-1.5 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md border bg-card [&>svg]:size-4">{icon}</span>
          <h3 className="font-medium text-lg">{title}</h3>
        </div>
        <p className="text-muted-foreground text-sm">{text}</p>
      </div>
    </div>
  )
}

// ---------- Aperçus de l'outil (piliers Reads, Plans, Acts) ----------

/** Reads : ce que l'agent a lu sur la montre, chiffres qui défilent et courbe de volume qui se trace. */
function ReadsVisual() {
  const metrics = [
    { label: 'VO2max', value: 54, unit: '' },
    { label: 'Threshold', value: 272, unit: '/km', pace: true },
    { label: 'Weekly', value: 42, unit: ' km' },
  ]
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <img alt="" className="size-4 rounded-[4px]" src="/partners/coros.png" />
        Synced from COROS
        <motion.span className="ml-auto size-1.5 rounded-full bg-[var(--success)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-md border bg-background px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
            <p className="font-semibold text-sm tabular-nums">
              <Count to={m.value} pace={m.pace} />
              <span className="font-normal text-muted-foreground text-xs">{m.unit}</span>
            </p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 200 40" className="h-10 w-full" fill="none" aria-hidden="true">
        <motion.path
          d="M0 32 L25 28 L50 30 L75 22 L100 24 L125 16 L150 18 L175 10 L200 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={inView}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
        />
      </svg>
    </div>
  )
}

/** Plans : l'agent écrit la semaine, les séances apparaissent une à une. */
function PlansVisual() {
  const sessions = [
    ['Tue', 'Intervals · 6 × 800 m', 'var(--session-interval)'],
    ['Thu', 'Tempo · 3 × 10 min', 'var(--session-tempo)'],
    ['Sun', 'Long run · 18 km', 'var(--session-long)'],
  ]
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs">
        <img alt="" className="size-4 rounded-[4px]" src="/partners/claude.png" />
        <TextShimmer className="text-muted-foreground">Writing week 7…</TextShimmer>
      </div>
      <motion.div className="flex flex-col gap-1.5" initial="hidden" whileInView="shown" viewport={inView} transition={{ staggerChildren: 0.35, delayChildren: 0.3 }}>
        {sessions.map(([day, label, color]) => (
          <motion.div
            key={day}
            className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
            variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
          >
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            <span className="w-7 text-muted-foreground">{day}</span>
            <span>{label}</span>
          </motion.div>
        ))}
      </motion.div>
      <motion.p className="text-[11px] text-muted-foreground" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={inView} transition={{ delay: 1.5 }}>
        Load check · +8 % vs last week ✓
      </motion.p>
    </div>
  )
}

/** Acts : la séance sur la montre, sa progression, puis la semaine suivante réécrite. */
function ActsVisual() {
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="relative flex size-36 shrink-0 flex-col items-center justify-center rounded-[36px] border-4 border-[#1f1f1f] bg-black shadow-xl">
        <svg viewBox="0 0 100 100" className="absolute size-28 -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="44" stroke="#262626" strokeWidth="6" fill="none" />
          <motion.circle
            cx="50"
            cy="50"
            r="44"
            stroke="var(--session-interval)"
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 0.62 }}
            viewport={inView}
            transition={{ duration: 1.6, ease: 'easeOut' }}
          />
        </svg>
        <span className="text-[10px] text-muted-foreground">Rep 4 / 6</span>
        <span className="font-semibold text-xl tabular-nums">3:55</span>
        <span className="text-[10px] text-muted-foreground">/km · 800 m</span>
      </div>
      <motion.div
        className="flex max-w-36 flex-col gap-1 rounded-lg border bg-card p-2.5 text-xs"
        initial={{ opacity: 0, x: 12 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={inView}
        transition={{ delay: 1.2, duration: 0.4 }}
      >
        <span className="flex items-center gap-1.5 font-medium">
          <RefreshCwIcon className="size-3" /> Week 8 updated
        </span>
        <span className="text-muted-foreground">Tired legs logged: Thursday is now easy.</span>
      </motion.div>
    </div>
  )
}

/** Nombre qui défile jusqu'à sa valeur à l'apparition (allure en m:ss si `pace`). */
function Count({ to, pace }: { to: number; pace?: boolean }) {
  const v = useMotionValue(0)
  const text = useTransform(v, (n) => (pace ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}` : String(Math.round(n))))
  return (
    <motion.span onViewportEnter={() => void animate(v, to, { duration: 1.2, ease: [0.22, 1, 0.36, 1] })} viewport={inView}>
      {text}
    </motion.span>
  )
}

// ---------- Visuels animés des étapes ----------

const inView = { once: true, amount: 0.5 } as const

/** Montres qui se synchronisent : des points voyagent de la montre vers Raice.run, en boucle. */
function SyncVisual() {
  const reduce = useReducedMotion()
  const marks = [
    { src: '/partners/coros.png', pad: '' },
    { src: '/partners/garmin.png', pad: 'p-2 invert' },
    { src: '/partners/apple.png', pad: 'p-2 invert' },
    { src: '/partners/polar-mark.svg', pad: 'p-1.5' },
    { src: '/partners/suunto-mark.svg', pad: 'p-1.5' },
  ]
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        {marks.map((m, i) => (
          <motion.span
            key={m.src}
            className={cn('flex size-9 items-center justify-center overflow-hidden rounded-[10px] border bg-card', i === 4 && 'col-span-2 justify-self-center')}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={inView}
            transition={{ delay: i * 0.08, type: 'spring', visualDuration: 0.35, bounce: 0.3 }}
          >
            <img alt="" className={cn('size-full object-contain', m.pad)} src={m.src} />
          </motion.span>
        ))}
      </div>
      <div className="relative h-px flex-1 bg-border">
        {[0, 1, 2].map((k) => (
          <motion.span
            key={k}
            className="absolute -top-[3px] size-1.5 rounded-full bg-foreground"
            initial={{ left: '0%', opacity: 0 }}
            animate={reduce ? { left: `${30 * k + 10}%`, opacity: 0.6 } : { left: ['0%', '100%'], opacity: [0, 1, 0] }}
            transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, delay: k * 0.5, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <span className="flex size-12 items-center justify-center rounded-[14px] border bg-card">
        <LogoIcon className="size-6" />
      </span>
    </div>
  )
}

/** Résultats publics qui arrivent un par un. */
function ResultsVisual() {
  const rows = [
    ['10 km · 400 m D+', '1:07'],
    ['Half marathon', '1:42'],
    ['50 km trail', '6:58'],
  ]
  return (
    <motion.div className="flex w-full flex-col gap-1.5" initial="hidden" whileInView="shown" viewport={inView} transition={{ staggerChildren: 0.25, delayChildren: 0.2 }}>
      {rows.map(([label, time]) => (
        <motion.div
          key={label}
          className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-xs"
          variants={{ hidden: { opacity: 0, x: -12 }, shown: { opacity: 1, x: 0 } }}
        >
          <span>{label}</span>
          <span className="text-muted-foreground tabular-nums">{time}</span>
        </motion.div>
      ))}
    </motion.div>
  )
}

/** Temps prévu qui défile jusqu'à sa valeur. */
function TimeVisual() {
  const seconds = useMotionValue(0)
  const text = useTransform(seconds, (v) => {
    const s = Math.round(v)
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  })
  return (
    <motion.div
      className="flex w-full flex-col items-center gap-1 rounded-md border bg-card py-4"
      onViewportEnter={() => void animate(seconds, 6290, { duration: 1.6, ease: [0.22, 1, 0.36, 1] })}
      viewport={inView}
    >
      <span className="text-muted-foreground text-xs">Half marathon</span>
      <motion.span className="font-semibold text-3xl tabular-nums tracking-tight">{text}</motion.span>
      <span className="text-muted-foreground text-xs">4:58 /km</span>
    </motion.div>
  )
}

/** Semaines du plan : la charge monte, puis l'affûtage avant la course. */
/**
 * Semaines du plan : la charge monte, puis l'affûtage avant la course. Au survol de la carte, les barres
 * rebondissent en vague jusqu'au jour J, qui s'allume avec son drapeau.
 */
function WeeksVisual() {
  const loads = [0.35, 0.45, 0.55, 0.4, 0.65, 0.75, 0.85, 0.55, 0.9, 1, 0.6, 0.3]
  return (
    <div className="relative w-full pt-7">
      <span className="absolute top-0 right-0 flex translate-y-1 items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] opacity-0 transition-all duration-300 group-hover/step:translate-y-0 group-hover/step:opacity-100">
        <FlagIcon className="size-3" /> Race day
      </span>
      <motion.div className="flex h-24 w-full items-end gap-1" initial="hidden" whileInView="shown" viewport={inView} transition={{ staggerChildren: 0.06 }}>
        {loads.map((h, i) => (
          <motion.span
            key={i}
            className="flex h-full flex-1 origin-bottom items-end"
            variants={{ hidden: { scaleY: 0 }, shown: { scaleY: 1 } }}
            transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.2 }}
          >
            <span
              className={cn(
                'block w-full origin-bottom rounded-sm transition-colors duration-300 group-hover/step:animate-[bar-wave_0.7s_ease-in-out]',
                i === loads.length - 1 ? 'bg-foreground/50 group-hover/step:bg-foreground' : 'bg-foreground/35 group-hover/step:bg-foreground/60'
              )}
              style={{ height: `${h * 100}%`, animationDelay: `${i * 45}ms` }}
            />
          </motion.span>
        ))}
      </motion.div>
    </div>
  )
}
