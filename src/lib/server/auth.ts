import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { create } from 'zustand'
import { api, setUnauthorizedHandler } from './api'

/** Connexion au serveur par passkey (Face ID / Touch ID), vérifiée côté serveur. */

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated'
  hasCredentials: boolean
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', hasCredentials: false }))

setUnauthorizedHandler(() => useAuth.setState({ status: 'anonymous' }))

export async function checkAuth() {
  try {
    const s = await api<{ authenticated: boolean; hasCredentials: boolean }>('/auth/status')
    useAuth.setState({ status: s.authenticated ? 'authenticated' : 'anonymous', hasCredentials: s.hasCredentials })
  } catch {
    useAuth.setState({ status: 'anonymous' })
  }
}

export async function login() {
  const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>('/auth/login/options', { body: {} })
  const response = await startAuthentication({ optionsJSON })
  await api('/auth/login/verify', { body: response })
  useAuth.setState({ status: 'authenticated' })
}

/** Nouveau passkey : code d'installation si on n'est pas encore connecté. */
export async function registerPasskey(setupCode?: string) {
  const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>('/auth/register/options', { body: { setupCode } })
  const response = await startRegistration({ optionsJSON })
  const name = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Appareil'
  await api('/auth/register/verify', { body: { response, name } })
  useAuth.setState({ status: 'authenticated', hasCredentials: true })
}

export async function logout() {
  await api('/auth/logout', { body: {} }).catch(() => undefined)
  window.location.reload()
}
