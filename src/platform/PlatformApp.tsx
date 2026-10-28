import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingRunPage } from './pages/OnboardingRunPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages'
import { SignupPage } from './pages/SignupPage'

// Le back office (graphiques, tableaux) n'est chargé que par les administrateurs.
const AdminApp = lazy(() => import('./admin/AdminApp'))
const RunnerApp = lazy(() => import('./runner/RunnerApp'))

export function PlatformApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/inscription" element={<SignupPage />} />
        <Route path="/onboarding" element={<OnboardingRunPage />} />
        <Route
          path="/account/*"
          element={
            <Suspense fallback={<div className="min-h-dvh" />}>
              <RunnerApp />
            </Suspense>
          }
        />
        <Route path="/compte/*" element={<LegacyAccountRedirect />} />
        <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
        <Route path="/reinitialiser" element={<ResetPasswordPage />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div className="min-h-dvh" />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/** Ancienne adresse de l'espace coureur (/compte/…) : mêmes pages sous /account, liens d'e-mails compris. */
const LEGACY_PAGES: Record<string, string> = { profil: 'profile', seance: 'session', objectif: 'goal' }
function LegacyAccountRedirect() {
  const { pathname, search, hash } = useLocation()
  const rest = pathname.replace(/^\/compte\/?/, '').replace(/^(profil|seance|objectif)\b/, (m) => LEGACY_PAGES[m])
  return <Navigate to={`/account/${rest}${search}${hash}`} replace />
}
