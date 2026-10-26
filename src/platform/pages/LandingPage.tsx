import { ArrowRightIcon, BrainCircuitIcon, RefreshCwIcon, WatchIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DecorIcon } from '@/components/decor-icon'
import { FullWidthDivider } from '@/components/full-width-divider'
import { Header } from '@/components/header'
import { HeroSection } from '@/components/hero'
import { Logo } from '@/components/logo'
import { Button } from '@/components/shadcn/button'
import { BRAND } from '../brand'

const FEATURES = [
  {
    id: 'fonctionnement',
    icon: <BrainCircuitIcon />,
    title: 'Un plan construit sur tes données',
    text: 'Allure seuil, VO2max, volume récent, plus longue sortie : le plan part de ce que tu cours vraiment, pas d’un tableau générique.',
  },
  {
    id: 'montre',
    icon: <WatchIcon />,
    title: 'Les séances arrivent sur ta montre',
    text: 'Connexion COROS en un clic. Chaque séance est envoyée avec ses blocs, ses allures et ses récupérations.',
  },
  {
    id: 'coach',
    icon: <RefreshCwIcon />,
    title: 'Un coach qui s’ajuste chaque semaine',
    text: 'Fatigue, séance ratée, déplacement : dis-le simplement, la semaine suivante est réécrite en tenant compte de tout.',
  },
]

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <Header />
      <main className="mx-auto max-w-5xl">
        <HeroSection />

        <section className="relative mt-16 mb-12" aria-labelledby="features-title">
          <h2 id="features-title" className="font-heading py-6 text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
            Pensé pour les coureurs <span className="text-foreground">qui ont un objectif</span>
          </h2>
          <div className="relative">
            <DecorIcon className="size-4" position="top-left" />
            <DecorIcon className="size-4" position="top-right" />
            <DecorIcon className="size-4" position="bottom-left" />
            <DecorIcon className="size-4" position="bottom-right" />
            <FullWidthDivider className="-top-px" />
            <div className="grid border md:grid-cols-3">
              {FEATURES.map((f, i) => (
                <article
                  key={f.id}
                  id={f.id}
                  className={`scroll-mt-24 flex flex-col gap-3 p-6 md:p-8 ${i < FEATURES.length - 1 ? 'border-b md:border-r md:border-b-0' : ''} ${i === 1 ? 'bg-secondary/40' : ''}`}
                >
                  <span className="flex size-9 items-center justify-center rounded-md border bg-card text-primary [&>svg]:size-4.5">{f.icon}</span>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.text}</p>
                </article>
              ))}
            </div>
            <FullWidthDivider className="-bottom-px" />
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 px-4 py-16 text-center">
          <h2 className="font-heading max-w-xl text-balance text-2xl md:text-3xl">Deux minutes de questions, un plan jusqu’au jour J.</h2>
          <Button asChild size="lg">
            <Link to="/onboarding">
              Créer mon plan <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-muted-foreground text-xs">
          <Logo className="text-xs" />
          <span>{BRAND.tagline}</span>
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
        </div>
      </footer>
    </div>
  )
}
