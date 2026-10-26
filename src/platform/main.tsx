import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRAND } from './brand'
import { PlatformApp } from './PlatformApp'

/** Raice.run est en thème sombre uniquement (noir et gris, accent neutre). */
function applyDarkTheme() {
  document.documentElement.classList.add('dark')
  document.documentElement.dataset.theme = 'dark'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0a0a')
}

export function mountPlatform(root: HTMLElement) {
  applyDarkTheme()
  document.title = BRAND.name
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <PlatformApp />
      </QueryClientProvider>
    </StrictMode>,
  )
}
