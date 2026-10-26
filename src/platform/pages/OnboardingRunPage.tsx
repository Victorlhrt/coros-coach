import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ArrowRightIcon, WatchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import { Input } from '@/components/arc/input/input'
import { NumberField } from '@/components/arc/number-field/number-field'
import { Progress } from '@/components/arc/progress/progress'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { Logo } from '@/components/logo'
import { Button } from '@/components/shadcn/button'
import { api, type OnboardingStep, type Variant } from '../api'
import { useMe } from '../session'
import { siteHref } from '../brand'

/** Identifiant du parcours en cours, relu par l'inscription pour rattacher les réponses au compte. */
export const ONBOARDING_KEY = 'platform.onboardingSession'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((label, i) => ({ value: String(i), label }))

type Answers = Record<string, unknown>

function isAnswered(step: OnboardingStep, value: unknown) {
  if (step.optional || step.kind === 'coros') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Déroule un parcours d'onboarding : tiré au sort parmi les parcours en ligne (test A/B),
 * ou forcé avec `?variant=` (aperçu depuis le back office avec `&preview=1`, exclu des statistiques).
 */
export function OnboardingRunPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const me = useMe()
  const forced = params.get('variant')
  const preview = params.get('preview') === '1'

  const variant = useQuery({
    queryKey: ['onboarding', 'pick', forced],
    queryFn: () => api<Variant>(`/onboarding/pick${forced ? `?variant=${encodeURIComponent(forced)}` : ''}`),
    staleTime: Infinity,
  })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!variant.data || started.current) return
    started.current = true
    api<{ id: string }>('/onboarding/sessions', { body: { variantId: variant.data.id, preview } })
      .then(({ id }) => {
        setSessionId(id)
        if (!preview) {
          try {
            sessionStorage.setItem(ONBOARDING_KEY, id)
          } catch {
            /* sans stockage, le parcours ne sera pas rattaché au compte */
          }
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [variant.data, preview])

  if (variant.isError) {
    return (
      <Frame>
        <p className="text-muted-foreground">{variant.error.message}</p>
      </Frame>
    )
  }
  if (!variant.data) return <Frame />

  const steps = variant.data.steps
  const step = steps[index]
  const value = answers[step.field]
  const last = index === steps.length - 1
  const set = (v: unknown) => setAnswers((a) => ({ ...a, [step.field]: v }))

  async function next() {
    if (!sessionId) return
    setBusy(true)
    setError('')
    try {
      const finalAnswers = step.kind === 'coros' && answers[step.field] === undefined ? { ...answers, [step.field]: false } : answers
      await api(`/onboarding/sessions/${sessionId}`, { method: 'PATCH', body: { answers: finalAnswers, stepReached: index + 1 } })
      if (!last) {
        setIndex(index + 1)
        return
      }
      const res = await api<{ needsAccount: boolean }>(`/onboarding/sessions/${sessionId}/complete`, { method: 'POST' })
      if (preview) setFinished(true)
      else navigate(res.needsAccount ? '/inscription' : '/compte')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (finished) {
    return (
      <Frame>
        <h1 className="font-heading text-2xl">Aperçu terminé</h1>
        <p className="text-muted-foreground text-sm">Ce parcours de test n’est pas compté dans les statistiques.</p>
        <pre className="max-h-64 overflow-auto rounded-lg border bg-card p-3 text-xs">{JSON.stringify(answers, null, 2)}</pre>
        <Button asChild>
          <Link to={`/admin/onboardings/${variant.data.id}`}>Retour au back office</Link>
        </Button>
      </Frame>
    )
  }

  return (
    <Frame banner={preview ? `Aperçu du parcours « ${variant.data.name} » : non compté dans les statistiques` : undefined}>
      <Progress value={index + 1} max={steps.length} label={`Étape ${index + 1} sur ${steps.length}`} />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-balance text-2xl md:text-3xl">{step.title}</h1>
        {step.help && <p className="text-muted-foreground text-sm">{step.help}</p>}
      </div>

      <form
        key={step.id}
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (isAnswered(step, value)) void next()
        }}
      >
        <StepInput step={step} value={value} onChange={set} />
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}>
            <ArrowLeftIcon /> Retour
          </Button>
          <Button type="submit" disabled={!sessionId || busy || !isAnswered(step, value)}>
            {step.kind === 'coros' && value === undefined ? 'Plus tard' : last ? (me.data ? 'Générer mon plan' : 'Continuer') : 'Suivant'}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </form>
    </Frame>
  )
}

function StepInput({ step, value, onChange }: { step: OnboardingStep; value: unknown; onChange: (v: unknown) => void }) {
  switch (step.kind) {
    case 'choice':
      return (
        <RadioCards
          aria-label={step.title}
          layout="list"
          options={(step.options ?? []).map((o) => ({ value: o.value, label: o.label, description: o.hint }))}
          value={typeof value === 'string' ? value : null}
          onValueChange={onChange}
        />
      )
    case 'multi':
      return (
        <ChipGroup
          label={step.title}
          options={(step.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
          value={Array.isArray(value) ? (value as string[]) : []}
          onValueChange={onChange}
        />
      )
    case 'days':
      return <ChipGroup label={step.title} options={DAYS} value={Array.isArray(value) ? (value as string[]) : []} onValueChange={onChange} />
    case 'number':
      return (
        <NumberField
          label={step.title}
          value={typeof value === 'number' ? value : (step.min ?? 0)}
          onValueChange={onChange}
          min={step.min ?? 0}
          max={step.max ?? 1000}
          suffix={step.unit ? ` ${step.unit}` : undefined}
          locale="fr-FR"
          size="lg"
        />
      )
    case 'date':
      return (
        <Input
          label="Date"
          type="date"
          min={new Date().toISOString().slice(0, 10)}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'text':
      return <Input label="Réponse" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
    case 'coros':
      // La connexion COROS des comptes de la plateforme n'est pas encore branchée : on enregistre l'intention.
      return (
        <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
          <WatchIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              La connexion COROS arrive dans l’espace coureur. Dis-nous si tu as une montre COROS : on te prévient dès que c’est prêt.
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={value === true ? 'default' : 'outline'} onClick={() => onChange(true)}>
                J’ai une COROS
              </Button>
              <Button type="button" size="sm" variant={value === false ? 'default' : 'outline'} onClick={() => onChange(false)}>
                Pas de COROS
              </Button>
            </div>
          </div>
        </div>
      )
  }
}

function Frame({ children, banner }: { children?: React.ReactNode; banner?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {banner && <p className="bg-primary/10 px-4 py-2 text-center text-primary text-xs">{banner}</p>}
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-5">
        <a href={siteHref()}>
          <Logo />
        </a>
        <Link to="/connexion" className="text-muted-foreground text-sm hover:text-foreground">
          Se connecter
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 pt-6 pb-12">{children}</main>
    </div>
  )
}
