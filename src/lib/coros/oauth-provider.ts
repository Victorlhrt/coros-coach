import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { SCOPES, redirectUrl } from './config'
import { TOKENS_KEY, useCorosAuth } from './auth-store'

const CLIENT_KEY = 'coros.client'
const VERIFIER_KEY = 'coros.pkceVerifier'
const STATE_KEY = 'coros.oauthState'
const DISCOVERY_KEY = 'coros.discovery'

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

/**
 * Fournisseur OAuth du SDK MCP, entièrement côté navigateur :
 * client public enregistré dynamiquement (DCR), PKCE S256, tokens en localStorage.
 *
 * La redirection vers COROS n'a lieu que si `allowRedirect` est vrai (bouton
 * « Connecter COROS »). Un refresh qui échoue en arrière-plan déconnecte
 * proprement au lieu de quitter la page sans prévenir.
 */
class CorosOAuthProvider implements OAuthClientProvider {
  allowRedirect = false

  get redirectUrl() {
    return redirectUrl()
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Coach COROS (perso)',
      redirect_uris: [redirectUrl()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPES,
    }
  }

  state() {
    const value = crypto.randomUUID()
    localStorage.setItem(STATE_KEY, value)
    return value
  }

  /** Vérifie le `state` reçu au retour de COROS (le SDK ne le fait pas). */
  consumeState(received: string | null) {
    const expected = localStorage.getItem(STATE_KEY)
    localStorage.removeItem(STATE_KEY)
    return expected !== null && received === expected
  }

  clientInformation() {
    // Enregistré par URL de retour : localhost et GitHub Pages ont chacun leur client.
    const saved = read<{ redirect: string; info: OAuthClientInformationMixed }>(CLIENT_KEY)
    return saved?.redirect === redirectUrl() ? saved.info : undefined
  }

  saveClientInformation(info: OAuthClientInformationMixed) {
    write(CLIENT_KEY, { redirect: redirectUrl(), info })
  }

  tokens() {
    return read<OAuthTokens>(TOKENS_KEY)
  }

  saveTokens(tokens: OAuthTokens) {
    write(TOKENS_KEY, tokens)
    useCorosAuth.getState().refresh()
  }

  redirectToAuthorization(url: URL) {
    if (!this.allowRedirect) {
      this.invalidateCredentials('tokens')
      return
    }
    window.location.assign(url.toString())
  }

  saveCodeVerifier(verifier: string) {
    localStorage.setItem(VERIFIER_KEY, verifier)
  }

  codeVerifier() {
    const verifier = localStorage.getItem(VERIFIER_KEY)
    if (!verifier) throw new Error('Code PKCE introuvable : relance la connexion COROS.')
    return verifier
  }

  saveDiscoveryState(state: OAuthDiscoveryState) {
    write(DISCOVERY_KEY, state)
  }

  discoveryState() {
    return read<OAuthDiscoveryState>(DISCOVERY_KEY)
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'client') localStorage.removeItem(CLIENT_KEY)
    if (scope === 'all' || scope === 'tokens') localStorage.removeItem(TOKENS_KEY)
    if (scope === 'all' || scope === 'verifier') localStorage.removeItem(VERIFIER_KEY)
    if (scope === 'all' || scope === 'discovery') localStorage.removeItem(DISCOVERY_KEY)
    useCorosAuth.getState().refresh()
  }
}

export const corosOAuth = new CorosOAuthProvider()
