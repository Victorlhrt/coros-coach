import {
  ArrowRightIcon,
  BotIcon,
  CalendarRangeIcon,
  FootprintsIcon,
  GaugeIcon,
  HeartPulseIcon,
  MountainIcon,
  RefreshCwIcon,
  SparklesIcon,
  TargetIcon,
  WatchIcon,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { DecorIcon } from '@/components/decor-icon'
import { FullWidthDivider } from '@/components/full-width-divider'
import { Header } from '@/components/header'
import { HeroSection } from '@/components/hero'
import { Logo } from '@/components/logo'
import { Button } from '@/components/shadcn/button'
import { cn } from '@/lib/utils'
import { BRAND, appHref } from '../brand'

/** Fond « grille de points » des cartes : points discrets, fondus vers le bas. */
const DOT_GRID =
  'bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_16%,transparent)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent)]'

const STEPS: { title: string; text: string; icon: ReactNode; visual: ReactNode }[] = [
  {
    title: 'Tell us why you run',
    text: 'A race on the calendar, getting faster, structure, a comeback. Your plan starts from your reason.',
    icon: <SparklesIcon />,
    visual: <Chips items={['Prepare a race', 'Get faster', 'Come back']} active={0} />,
  },
  {
    title: 'Connect your watch',
    text: 'COROS today, Garmin next. Your history loads in the background while you finish the questions.',
    icon: <WatchIcon />,
    visual: <Chips items={['COROS', 'Garmin', 'Apple Watch · soon']} active={0} />,
  },
  {
    title: 'We find your results',
    text: 'Name and email are enough: we look up your public race results to know your real level.',
    icon: <MountainIcon />,
    visual: <Row label="Grand Velay · 10 km" value="1:07:27" />,
  },
  {
    title: 'Pick your goal',
    text: 'Search your race, road or trail, or simply train. Distance, elevation and date set the plan’s spine.',
    icon: <TargetIcon />,
    visual: <Row label="Half · 21.1 km" value="Apr 11" />,
  },
  {
    title: 'See your predicted time',
    text: 'Computed from your recent races, elevation included. Slide it if you want to aim faster or safer.',
    icon: <GaugeIcon />,
    visual: <Big value="1:44:50" caption="4:58 /km · realistic" />,
  },
  {
    title: 'Check in with your body',
    text: 'Recent pain, injury, illness, a busy month: the first weeks are dosed to keep you healthy.',
    icon: <HeartPulseIcon />,
    visual: <Chips items={['Knee', 'Achilles', 'None']} active={2} />,
  },
  {
    title: 'Add your shoes',
    text: 'Pick your model and its mileage. We track wear and tell you when a pair is done.',
    icon: <FootprintsIcon />,
    visual: <Row label="Endorphin Speed" value="412 km" />,
  },
  {
    title: 'Your plan is built',
    text: 'Week by week until race day, every session with its paces and recoveries, ready to sync.',
    icon: <CalendarRangeIcon />,
    visual: <Progress />,
  },
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
          <div className="grid border md:grid-cols-3">
            <Pillar icon={<WatchIcon />} title="Reads" text="Agents connect to your watch and your public results to know your real paces, volume and history." />
            <Pillar icon={<BotIcon />} title="Plans" text="Claude builds your plan week by week around your goal, your days and your body, then checks the load." className="md:border-x" />
            <Pillar icon={<RefreshCwIcon />} title="Acts" text="Sessions land on your wrist. After each week, the next one is rewritten from what you actually ran." />
          </div>
        </Section>

        <Section
          id="how-it-works"
          eyebrow="How it works"
          title={
            <>
              Eight steps, <span className="text-foreground">two minutes</span>
            </>
          }
        >
          <ol className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex min-h-72 flex-col gap-4 overflow-hidden bg-background p-5">
                <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', DOT_GRID)} />
                <div className="relative flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md border bg-card text-foreground [&>svg]:size-4.5">{s.icon}</span>
                  <span className="text-muted-foreground text-xs">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="relative flex flex-col gap-1.5">
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{s.text}</p>
                </div>
                <div className="relative mt-auto">{s.visual}</div>
              </li>
            ))}
          </ol>
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
          <div className="grid border md:grid-cols-2">
            <div className="flex flex-col gap-4 border-b p-6 md:border-r md:border-b-0 md:p-8">
              <p className="text-muted-foreground leading-relaxed">
                Connect COROS once. Your recent runs set your paces, and each workout is sent to the watch with its warm-up, intervals,
                recoveries and cool-down. Run it, and the result comes back on its own.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {['History imported in the background', 'Structured workouts with target paces', 'Runs matched to planned sessions automatically'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-foreground" /> {t}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">COROS available now · Garmin next · Apple Watch, Suunto and Polar later</p>
            </div>
            <div className={cn('relative flex flex-col gap-2 p-6 md:p-8')}>
              <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', DOT_GRID)} />
              <p className="relative text-muted-foreground text-xs">TUE · INTERVALS · 9.6 KM</p>
              {[
                ['Warm-up', '15 min · easy', 'w-1/4'],
                ['6 × 800 m', '3:55 /km', 'w-full'],
                ['Recovery', '2 min jog', 'w-1/3'],
                ['Cool-down', '10 min · easy', 'w-1/5'],
              ].map(([a, b, w]) => (
                <div key={a} className="relative flex items-center gap-3 rounded-md border bg-card px-3 py-2.5">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{a}</p>
                    <div className="mt-1.5 h-1 rounded-full bg-muted">
                      <div className={cn('h-1 rounded-full bg-foreground/70', w)} />
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs">{b}</span>
                </div>
              ))}
            </div>
          </div>
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
          <div className="grid border md:grid-cols-2">
            <div className="relative flex flex-col gap-3 border-b p-6 md:border-r md:border-b-0 md:p-8">
              <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', DOT_GRID)} />
              <Bubble side="right">Work trip Thursday to Saturday, and my left calf is tight.</Bubble>
              <Bubble side="left">Got it. I moved the tempo to Tuesday, turned Thursday into rest, and swapped Saturday’s hills for an easy 40 minutes. Sunday’s long run stays, 2 km shorter.</Bubble>
              <Bubble side="right">Perfect.</Bubble>
            </div>
            <div className="flex flex-col gap-4 p-6 md:p-8">
              <p className="text-muted-foreground leading-relaxed">
                Tell the coach what changed, in your own words. It reshapes the week around your schedule, your fatigue and your body, without losing
                the thread of your goal.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {['Weekly review from what you actually ran', 'Fatigue, pain and missed sessions taken into account', 'Race-week taper built in'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-foreground" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
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

        <section className="flex flex-col items-center gap-4 px-4 py-20 text-center">
          <h2 className="font-heading max-w-xl text-balance font-semibold text-2xl tracking-tight md:text-4xl">Two minutes of questions. A plan all the way to race day.</h2>
          <Button asChild size="lg">
            <a href={appHref('/onboarding')}>
              Build my plan <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-muted-foreground text-xs">
          <Logo className="text-xs" />
          <span>Agentic running: your plan, written by AI, synced to your watch.</span>
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
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

function Pillar({ icon, title, text, className }: { icon: ReactNode; title: string; text: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 border-b p-6 md:border-b-0 md:p-8', className)}>
      <span className="flex size-9 items-center justify-center rounded-md border bg-card [&>svg]:size-4.5">{icon}</span>
      <h3 className="font-medium text-lg">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
    </div>
  )
}

// ---------- Petits visuels des cartes d'étapes ----------

function Chips({ items, active }: { items: string[]; active: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={t} className={cn('rounded-full border px-2.5 py-1 text-xs', i === active ? 'border-foreground/60 bg-foreground/10 text-foreground' : 'bg-card text-muted-foreground')}>
          {t}
        </span>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-xs">
      <span className="truncate">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}

function Big({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <p className="font-semibold text-2xl tabular-nums tracking-tight">{value}</p>
      <p className="text-muted-foreground text-xs">{caption}</p>
    </div>
  )
}

function Progress() {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5 text-xs">
      <div className="flex justify-between">
        <span>Building your weeks</span>
        <span className="text-muted-foreground">100%</span>
      </div>
      <div className="h-1 rounded-full bg-muted">
        <div className="h-1 w-full rounded-full bg-foreground/70" />
      </div>
    </div>
  )
}

function Bubble({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return (
    <p
      className={cn(
        'relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
        side === 'right' ? 'self-end bg-foreground text-background' : 'self-start border bg-card text-foreground'
      )}
    >
      {children}
    </p>
  )
}
