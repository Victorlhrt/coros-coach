import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
          path="/compte/*"
          element={
            <Suspense fallback={<div className="min-h-dvh" />}>
              <RunnerApp />
            </Suspense>
          }
        />
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
