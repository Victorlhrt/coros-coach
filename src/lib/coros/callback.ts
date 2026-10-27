import { useEffect, useState } from 'react'
import { useVault } from '@/lib/lock/vault'
import { finishCorosLogin } from './client'

/**
 * COROS revient sur `/compte/settings?code=…&state=…`. On lit les paramètres au chargement
 * et on nettoie l'URL ; l'échange attend que le coffre soit ouvert (les tokens y sont écrits).
 */
const callback = (() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error_description') ?? params.get('error')
  if ((!code && !error) || !window.location.pathname.startsWith('/compte')) return null
  window.history.replaceState(null, '', window.location.pathname)
  return { code, state: params.get('state'), error }
})()
let exchanged = false

export function useCorosCallback() {
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
