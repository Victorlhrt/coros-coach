import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ConfirmSheet } from './components/ConfirmSheet'
import { LockScreen } from './components/LockScreen'
import { LoginScreen } from './components/LoginScreen'
import { PullToRefresh } from './components/PullToRefresh'
import { Toaster } from './components/Toaster'
import { TabBar } from './components/TabBar'
import { Button } from './components/ui/button'
import { useAutoLink } from './lib/coach/links'
import { useWeeklyReview } from './lib/coach/review'
import { finishCorosLogin } from './lib/coros/client'
import { useVault } from './lib/lock/vault'
import { checkAuth, useAuth } from './lib/server/auth'
import { startStateSync } from './lib/server/state-sync'
import { toast } from './lib/toast'
import { usePaceRepair } from './lib/store/plan'
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
 * COROS revient sur `/?code=…&state=…` (avant le #). On lit les paramètres au chargement
 * et on nettoie l'URL, mais l'échange attend que le coffre soit ouvert (les tokens y sont écrits).
 */
const callback = (() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error_description') ?? params.get('error')
  if (!code && !error) return null
  window.history.replaceState(null, '', `${import.meta.env.BASE_URL}#/reglages`)
  return { code, state: params.get('state'), error }
})()
let exchanged = false

function useOAuthCallback() {
  const vaultStatus = useVault((s) => s.status)
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>(!callback ? 'idle' : callback.code ? 'pending' : 'error')
  const [message, setMessage] = useState(callback?.error ?? null)

  useEffect(() => {
    if (vaultStatus !== 'open' || !callback?.code || exchanged) return
    exchanged = true
    finishCorosLogin(callback.code, callback.state)
      .then(() => setStatus('idle'))
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })
  }, [vaultStatus])

  return { status, message, dismiss: () => setStatus('idle') }
}

function Shell() {
  const location = useLocation()
  useAutoLink()
  usePaceRepair()
  useWeeklyReview()
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
  const locked = useVault((s) => s.status === 'locked')
  const auth = useAuth((s) => s.status)
  const oauth = useOAuthCallback()

  useEffect(() => {
    void checkAuth()
  }, [])
  useEffect(() => {
    if (auth === 'authenticated') startStateSync().catch((err) => toast.error(err))
  }, [auth])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1013' : '#fafafa')
  }, [theme])

  if (auth === 'loading') return <div className="min-h-dvh" />
  if (auth === 'anonymous') return <LoginScreen />
  if (locked) return <LockScreen />

  if (oauth.status === 'pending') {
    return <div className="flex min-h-dvh items-center justify-center text-muted-foreground">Connexion à COROS…</div>
  }

  return (
    <HashRouter>
      {oauth.status === 'error' && (
        <div className="fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-40 mx-auto max-w-md rounded-2xl bg-destructive p-4 text-sm text-white shadow-lg">
          <p className="font-medium">Connexion COROS impossible</p>
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
