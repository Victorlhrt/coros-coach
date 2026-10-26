import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SignupForm, type SignupDetails } from '@/components/arc/blocks/signup-form/signup-form'
import { Logo } from '@/components/logo'
import { api } from '../api'
import { BRAND, siteHref } from '../brand'
import { ONBOARDING_KEY, SIGNUP_PREFILL_KEY } from './OnboardingRunPage'

/** Bloc Arc signup-form, branché sur /api/platform/auth/signup. */
export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [result, setResult] = useState<'active' | 'waitlist' | null>(null)
  const [prefill] = useState<{ name?: string; email?: string } | undefined>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SIGNUP_PREFILL_KEY) ?? 'null') ?? undefined
    } catch {
      return undefined
    }
  })

  async function submit(details: SignupDetails) {
    let onboardingSessionId: string | undefined
    try {
      onboardingSessionId = sessionStorage.getItem(ONBOARDING_KEY) ?? undefined
    } catch {
      /* stockage indisponible : l'inscription se fait sans rattacher le parcours */
    }
    const source = params.get('utm_source') ?? params.get('source') ?? undefined
    const res = await api<{ status: 'active' | 'waitlist' }>('/auth/signup', { body: { ...details, source, onboardingSessionId } })
    try {
      sessionStorage.removeItem(ONBOARDING_KEY)
    } catch {
      /* rien à nettoyer */
    }
    setResult(res.status)
    await qc.invalidateQueries({ queryKey: ['me'] })
  }

  return (
    <div className="flex min-h-dvh flex-col items-center gap-8 px-4 py-8">
      <a href={siteHref()} aria-label={`Accueil ${BRAND.name}`}>
        <Logo />
      </a>
      <SignupForm
        brand={BRAND.name}
        onSubmit={submit}
        defaultValues={prefill}
        onSignIn={() => navigate('/connexion')}
        done={
          result === 'waitlist'
            ? { title: 'Tu es sur la liste', text: 'Les places de la bêta sont limitées : on t’écrit dès que ton compte est ouvert, à l’adresse' }
            : { title: 'Bienvenue !', text: 'Ton compte est prêt et ton plan est en préparation. Compte :', action: 'Voir mon plan', onAction: () => navigate('/compte') }
        }
      />
    </div>
  )
}
