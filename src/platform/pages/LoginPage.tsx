import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LoginCentered } from '@/components/arc/blocks/login-centered/login-centered'
import { LogoIcon } from '@/components/logo'
import { api, type Me } from '../api'
import { BRAND } from '../brand'
import { AuthSplit } from './AuthVisual'

/** Bloc Arc login-centered, en mode e-mail + mot de passe. */
export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()

  async function signIn(email: string, password: string) {
    await api('/auth/login', { body: { email, password } })
    const { user } = await api<{ user: Me | null }>('/auth/me')
    qc.setQueryData(['me'], user)
    // Laisse l'écran de confirmation du bloc s'afficher un instant avant de partir.
    const next = params.get('next')
    window.setTimeout(() => navigate(next?.startsWith('/') ? next : user?.role === 'admin' ? '/admin' : '/compte', { replace: true }), 900)
  }

  return (
    <AuthSplit>
    <LoginCentered
      fullScreen
      brand={BRAND.name}
      brandMark={<LogoIcon width={20} height={20} />}
      onPasswordSignIn={signIn}
      onSignUp={() => navigate('/onboarding')}
      onForgotPassword={() => navigate('/mot-de-passe-oublie')}
      termsHref="#conditions"
      privacyHref="#confidentialite"
    />
    </AuthSplit>
  )
}
