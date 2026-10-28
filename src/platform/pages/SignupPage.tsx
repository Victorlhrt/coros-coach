import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SignupForm, type SignupDetails } from '@/components/arc/blocks/signup-form/signup-form'
import { Logo } from '@/components/logo'
import { api } from '../api'
import { BRAND, siteHref } from '../brand'
import { ONBOARDING_KEY, SIGNUP_PREFILL_KEY } from './OnboardingRunPage'
import { AuthSplit } from './AuthVisual'

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
    <AuthSplit>
    <div className="flex min-h-dvh flex-col items-center gap-8 px-4 py-8">
      <a href={siteHref()} aria-label={`${BRAND.name} home`}>
        <Logo />
      </a>
      <SignupForm
        brand={BRAND.name}
        onSubmit={submit}
        defaultValues={prefill}
        onSignIn={() => navigate('/login')}
        done={
          result === 'waitlist'
            ? { title: 'You’re on the list', text: 'Beta spots are limited. We’ll email you as soon as your account opens, at' }
            : { title: 'Welcome!', text: 'Your account is ready and your plan is being built. Account:', action: 'See my plan', onAction: () => navigate('/account') }
        }
      />
    </div>
    </AuthSplit>
  )
}
