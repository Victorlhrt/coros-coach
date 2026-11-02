import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LoginCentered } from '@/components/arc/blocks/login-centered/login-centered'
import { LogoIcon } from '@/components/logo'
import { api, type Me } from '../api'
import { BRAND } from '../brand'
import { useMe } from '../session'
import { AuthSplit } from './AuthVisual'

/** Bloc Arc login-centered, en mode e-mail + mot de passe. */
export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const me = useMe()
  const signingIn = useRef(false)
  const next = params.get('next')
  const target = next?.startsWith('/') ? next : '/account'

  async function signIn(email: string, password: string) {
    await api('/auth/login', { body: { email, password } })
    signingIn.current = true
    const { user } = await api<{ user: Me | null }>('/auth/me')
    qc.setQueryData(['me'], user)
    // Laisse l'écran de confirmation du bloc s'afficher un instant avant de partir.
    window.setTimeout(() => navigate(target, { replace: true }), 900)
  }

  // Déjà connecté (cookie encore valide) : pas besoin de ressaisir le mot de passe.
  if (me.data && !signingIn.current) return <Navigate to={target} replace />

  return (
    <AuthSplit>
    <LoginCentered
      fullScreen
      brand={BRAND.name}
      brandMark={<LogoIcon width={20} height={20} />}
      onPasswordSignIn={signIn}
      onSignUp={() => navigate('/onboarding')}
      onForgotPassword={() => navigate('/forgot-password')}
      termsHref="#terms"
      privacyHref="#privacy"
    />
    </AuthSplit>
  )
}
