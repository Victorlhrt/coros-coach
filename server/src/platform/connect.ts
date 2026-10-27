import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { Hono } from 'hono'
import { config } from '../config.js'
import { db, getSetting } from './db.js'

/**
 * Connexion COROS pendant l'onboarding, par le serveur MCP officiel de COROS (OAuth 2.1, PKCE,
 * enregistrement dynamique du client). Les tokens sont gardés côté serveur, d'abord rattachés au
 * parcours, puis au compte quand il est créé. Garmin, Suunto, Polar : en attente des programmes partenaires.
 */
export const connectRoutes = new Hono()

const COROS_MCP = 'https://mcpeu.coros.com/mcp'
const COROS_SCOPES = 'openid mcp.tools offline_access'
const redirectUrl = () => `${config.origin}/api/platform/connect/coros/callback`
const CLIENT_KEY = () => `coros_client:${redirectUrl()}`

/** Fournisseur OAuth pour un parcours : client partagé (app_settings), PKCE et state par connexion. */
class ServerCorosProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null
  private verifier: string | null = null
  private stateValue: string
  tokensValue: OAuthTokens | null = null
  private client: OAuthClientInformationMixed | undefined

  constructor(state?: string, verifier?: string | null) {
    this.stateValue = state ?? crypto.randomUUID()
    this.verifier = verifier ?? null
  }

  async load() {
    this.client = (await getSetting<OAuthClientInformationMixed | null>(CLIENT_KEY(), null)) ?? undefined
    return this
  }

  get redirectUrl() {
    return redirectUrl()
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Raice.run',
      client_uri: 'https://raice.run',
      redirect_uris: [redirectUrl()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: COROS_SCOPES,
    }
  }

  state() {
    return this.stateValue
  }

  clientInformation() {
    return this.client
  }

  async saveClientInformation(info: OAuthClientInformationMixed) {
    this.client = info
    await db`insert into app_settings (key, value) values (${CLIENT_KEY()}, ${db.json(info as never)})
             on conflict (key) do update set value = excluded.value`
  }

  tokens() {
    return this.tokensValue ?? undefined
  }

  saveTokens(tokens: OAuthTokens) {
    this.tokensValue = tokens
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url
  }

  saveCodeVerifier(verifier: string) {
    this.verifier = verifier
  }

  codeVerifier() {
    if (!this.verifier) throw new Error('Code PKCE introuvable')
    return this.verifier
  }

  getVerifier() {
    return this.verifier
  }
}

/** Démarre la connexion : renvoie l'URL d'autorisation COROS, à ouvrir dans une nouvelle fenêtre. */
connectRoutes.post('/coros/start', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { sessionId?: string } | null
  const sessionId = body?.sessionId
  if (!sessionId) return c.json({ error: 'Parcours manquant' }, 400)
  const [session] = await db`select 1 from onboarding_sessions where id = ${sessionId} and completed_at is null`
  if (!session) return c.json({ error: 'Parcours introuvable ou terminé' }, 404)
  const provider = await new ServerCorosProvider().load()
  try {
    const result = await auth(provider, { serverUrl: COROS_MCP, scope: COROS_SCOPES })
    if (result !== 'REDIRECT' || !provider.authorizationUrl) throw new Error('COROS n’a pas renvoyé de page de connexion')
  } catch (e) {
    console.error('[coros] démarrage OAuth', e)
    return c.json({ error: 'COROS ne répond pas, réessaie dans un instant.' }, 502)
  }
  await db`insert into oauth_pending (state, provider, onboarding_session_id, verifier)
           values (${provider.state()}, 'coros', ${sessionId}, ${provider.getVerifier()})`
  return c.json({ url: provider.authorizationUrl.toString() })
})

const page = (title: string, text: string) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fafafa;font:15px/1.5 Inter,system-ui,sans-serif;text-align:center;padding:24px}p{color:#a1a1a1;max-width:340px}</style></head>
<body><div><h1 style="font-size:20px;font-weight:600">${title}</h1><p>${text}</p></div><script>setTimeout(function(){window.close()},1200)</script></body></html>`

/** Retour de COROS : échange du code, tokens rattachés au parcours. */
connectRoutes.get('/coros/callback', async (c) => {
  const state = c.req.query('state') ?? ''
  const code = c.req.query('code')
  const [pending] = await db<{ onboarding_session_id: string; verifier: string | null }[]>`
    delete from oauth_pending where state = ${state} and provider = 'coros' returning onboarding_session_id, verifier`
  if (!pending || !code) return c.html(page('Connexion interrompue', 'Reviens sur Raice.run et relance la connexion COROS.'), 400)
  const provider = await new ServerCorosProvider(state, pending.verifier).load()
  try {
    const result = await auth(provider, { serverUrl: COROS_MCP, authorizationCode: code, scope: COROS_SCOPES })
    if (result !== 'AUTHORIZED' || !provider.tokensValue) throw new Error('Autorisation non obtenue')
  } catch (e) {
    console.error('[coros] échange du code', e)
    return c.html(page('Connexion refusée', 'COROS n’a pas validé la connexion. Reviens sur Raice.run pour réessayer.'), 502)
  }
  const [session] = await db<{ user_id: string | null }[]>`select user_id from onboarding_sessions where id = ${pending.onboarding_session_id}`
  await db`
    insert into wearable_connections (provider, onboarding_session_id, user_id, tokens)
    values ('coros', ${pending.onboarding_session_id}, ${session?.user_id ?? null}, ${db.json(provider.tokensValue as never)})
    on conflict (provider, onboarding_session_id) do update set tokens = excluded.tokens, updated_at = now()`
  return c.html(page('COROS connecté', 'Tu peux fermer cette fenêtre et revenir à ta conversation avec Pacer.'))
})

/** État des connexions d'un parcours (interrogé pendant que la fenêtre COROS est ouverte). */
connectRoutes.get('/status', async (c) => {
  const sessionId = c.req.query('session')
  if (!sessionId) return c.json({ providers: [] })
  const rows = await db<{ provider: string }[]>`select provider from wearable_connections where onboarding_session_id = ${sessionId}`
  return c.json({ providers: rows.map((r) => r.provider) })
})
