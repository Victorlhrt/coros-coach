import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ConfirmSheet } from './components/ConfirmSheet'
import { PullToRefresh } from './components/PullToRefresh'
import { Toaster } from './components/Toaster'
import { TabBar } from './components/TabBar'
import { Button } from './components/ui/button'
import { finishCorosLogin } from './lib/coros/client'
import { useSettings } from './lib/store/settings'
import { AdjustPage } from './pages/AdjustPage'
import { DebugPage } from './pages/DebugPage'
import { HistoryPage } from './pages/HistoryPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlanPage } from './pages/PlanPage'
import { SessionPage } from './pages/SessionPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

/**
 * COROS revient sur `/coros-coach/?code=…&state=…` (avant le #).
 * Lu une seule fois au chargement : le code ne s'échange qu'une fois, même sous StrictMode.
 */
const callback = (() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error_description') ?? params.get('error')
  if (!code && !error) return null
  window.history.replaceState(null, '', `${import.meta.env.BASE_URL}#/reglages`)
  return code
    ? { exchange: finishCorosLogin(code, params.get('state')), error: null }
    : { exchange: null, error }
})()

function useOAuthCallback() {
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>(
    !callback ? 'idle' : callback.exchange ? 'pending' : 'error',
  )
  const [message, setMessage] = useState(callback?.error ?? null)

  useEffect(() => {
    callback?.exchange
      ?.then(() => setStatus('idle'))
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })
  }, [])

  return { status, message, dismiss: () => setStatus('idle') }
}

function Shell() {
  const location = useLocation()
  return (
    <>
      <main
        key={location.pathname}
        className="animate-page-in mx-auto max-w-md px-4 pt-[env(safe-area-inset-top)] pb-[calc(5rem+env(safe-area-inset-bottom))]"
      >
        <PullToRefresh>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/historique" element={<HistoryPage />} />
            <Route path="/reglages" element={<SettingsPage />} />
            <Route path="/objectif" element={<OnboardingPage />} />
            <Route path="/seance/:id" element={<SessionPage />} />
            <Route path="/ajuster" element={<AdjustPage />} />
            <Route path="/debug" element={<DebugPage />} />
            <Route path="*" element={<TodayPage />} />
          </Routes>
        </PullToRefresh>
      </main>
      <TabBar />
      <ConfirmSheet />
      <Toaster />
    </>
  )
}

export default function App() {
  const theme = useSettings((s) => s.theme)
  const oauth = useOAuthCallback()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1013' : '#fafafa')
  }, [theme])

  if (oauth.status === 'pending') {
    return <div className="flex min-h-dvh items-center justify-center text-muted-foreground">Connexion à COROS…</div>
  }

  return (
    <HashRouter>
      {oauth.status === 'error' && (
        <div className="fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-40 mx-auto max-w-md rounded-2xl bg-destructive p-4 text-sm text-white shadow-lg">
          <p className="font-semibold">Connexion COROS impossible</p>
          <p className="mt-1 opacity-90">{oauth.message}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={oauth.dismiss}>
            Fermer
          </Button>
        </div>
      )}
      <Shell />
    </HashRouter>
  )
}
