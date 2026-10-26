import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initVault, setupAutoLock } from './lib/lock/vault'
import { useSettings } from './lib/store/settings'

/** Coach personnel (sous /app/). */
export function mountCoach(root: HTMLElement) {
  // Avant le premier rendu : ouvre le coffre (ou le verrouille) et migre les anciennes données en clair.
  initVault()
  setupAutoLock(() => useSettings.getState().autoLockMinutes)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: true },
    },
  })

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}
