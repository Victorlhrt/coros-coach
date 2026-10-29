import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { Hono } from 'hono'
import { config } from '../config.js'
import { db, getSetting } from './db.js'
import type { GarminConnection } from './garmin.js'
import { corosInsights, emptyInsights, garminInsights, hasData, parseToolResult, type ToolCaller, type WatchInsights } from './watch-insights.js'

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
  if (!sessionId) return c.json({ error: 'Missing onboarding session' }, 400)
  const [session] = await db`select 1 from onboarding_sessions where id = ${sessionId} and completed_at is null`
  if (!session) return c.json({ error: 'Onboarding session not found or already finished' }, 404)
  const provider = await new ServerCorosProvider().load()
  try {
    const result = await auth(provider, { serverUrl: COROS_MCP, scope: COROS_SCOPES })
    if (result !== 'REDIRECT' || !provider.authorizationUrl) throw new Error('COROS n’a pas renvoyé de page de connexion')
  } catch (e) {
    console.error('[coros] démarrage OAuth', e)
    return c.json({ error: 'COROS isn’t responding, try again in a moment.' }, 502)
  }
  await db`insert into oauth_pending (state, provider, onboarding_session_id, verifier)
           values (${provider.state()}, 'coros', ${sessionId}, ${provider.getVerifier()})`
  return c.json({ url: provider.authorizationUrl.toString() })
})

const page = (title: string, text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fafafa;font:15px/1.5 Inter,system-ui,sans-serif;text-align:center;padding:24px}p{color:#a1a1a1;max-width:340px}</style></head>
<body><div><h1 style="font-size:20px;font-weight:600">${title}</h1><p>${text}</p></div><script>setTimeout(function(){window.close()},1200)</script></body></html>`

/** Retour de COROS : échange du code, tokens rattachés au parcours. */
connectRoutes.get('/coros/callback', async (c) => {
  const state = c.req.query('state') ?? ''
  const code = c.req.query('code')
  const [pending] = await db<{ onboarding_session_id: string; verifier: string | null }[]>`
    delete from oauth_pending where state = ${state} and provider = 'coros' returning onboarding_session_id, verifier`
  if (!pending || !code) return c.html(page('Connection interrupted', 'Go back to Raice.run and start the COROS connection again.'), 400)
  const provider = await new ServerCorosProvider(state, pending.verifier).load()
  try {
    const result = await auth(provider, { serverUrl: COROS_MCP, authorizationCode: code, scope: COROS_SCOPES })
    if (result !== 'AUTHORIZED' || !provider.tokensValue) throw new Error('Autorisation non obtenue')
  } catch (e) {
    console.error('[coros] échange du code', e)
    return c.html(page('Connection declined', 'COROS didn’t approve the connection. Go back to Raice.run to try again.'), 502)
  }
  const [session] = await db<{ user_id: string | null }[]>`select user_id from onboarding_sessions where id = ${pending.onboarding_session_id}`
  await db`
    insert into wearable_connections (provider, onboarding_session_id, user_id, tokens)
    values ('coros', ${pending.onboarding_session_id}, ${session?.user_id ?? null}, ${db.json(provider.tokensValue as never)})
    on conflict (provider, onboarding_session_id) do update set tokens = excluded.tokens, updated_at = now()`
  return c.html(page('COROS connected', 'You can close this window and go back to your chat with Pacer.'))
})

/** État des connexions d'un parcours (interrogé pendant que la fenêtre COROS est ouverte). */
connectRoutes.get('/status', async (c) => {
  const sessionId = c.req.query('session')
  if (!sessionId) return c.json({ providers: [] })
  const rows = await db<{ provider: string }[]>`select provider from wearable_connections where onboarding_session_id = ${sessionId}`
  return c.json({ providers: rows.map((r) => r.provider) })
})

/**
 * Client MCP COROS du serveur pour une connexion enregistrée (lecture seule). Le SDK rafraîchit le token
 * expiré avec le refresh token ; le nouveau jeu est réenregistré sur la connexion.
 */
export async function withCorosTools<T>(conn: { id: string; tokens: OAuthTokens }, fn: (call: ToolCaller) => Promise<T>): Promise<T> {
  const provider = await new ServerCorosProvider().load()
  provider.tokensValue = conn.tokens
  const client = new Client({ name: 'raice-run', version: '1.0.0' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(COROS_MCP), { authProvider: provider }))
    return await fn(async (name, args = {}) => parseToolResult(await client.callTool({ name, arguments: args })))
  } finally {
    await client.close().catch(() => undefined)
    if (provider.tokensValue && provider.tokensValue !== conn.tokens) {
      await db`update wearable_connections set tokens = ${db.json(provider.tokensValue as never)}, updated_at = now() where id = ${conn.id}`.catch(() => undefined)
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSIGHTS_TTL = 10 * 60_000
/** Lectures en cours par parcours : deux appels rapprochés partagent la même. */
const pendingInsights = new Map<string, Promise<WatchInsights>>()

/**
 * Aperçu de la montre connectée pendant l'onboarding (volume, records, VO2max…), sans connexion au compte.
 * Gardé 10 min sur le parcours ; une lecture en échec renvoie des null.
 */
connectRoutes.get('/insights', async (c) => {
  const sessionId = c.req.query('sessionId') ?? c.req.query('session') ?? ''
  if (!UUID.test(sessionId)) return c.json({ error: 'Missing onboarding session' }, 400)
  const [session] = await db<{ watch_insights: WatchInsights | null }[]>`select watch_insights from onboarding_sessions where id = ${sessionId}`
  if (!session) return c.json({ error: 'Onboarding session not found' }, 404)
  const rows = await db<{ id: string; provider: string; user_id: string | null; onboarding_session_id: string | null; tokens: OAuthTokens }[]>`
    select id, provider, user_id, onboarding_session_id, tokens from wearable_connections where onboarding_session_id = ${sessionId} order by updated_at desc`
  const conn = rows.find((r) => r.provider === 'coros') ?? rows.find((r) => r.provider === 'garmin')
  if (!conn) return c.json({ error: 'No watch connected yet' }, 404)
  const provider = conn.provider as WatchInsights['source']

  const cached = session.watch_insights
  if (cached?.source === provider && Date.now() - Date.parse(cached.fetchedAt) < INSIGHTS_TTL) return c.json(cached)

  let pending = pendingInsights.get(sessionId)
  if (!pending) {
    pending = (provider === 'coros' ? withCorosTools(conn, (call) => corosInsights(call)) : garminInsights(conn as unknown as GarminConnection))
      .catch((e: unknown) => {
        console.error(`[insights] ${provider}`, e instanceof Error ? e.message : e)
        return emptyInsights(provider)
      })
      .finally(() => pendingInsights.delete(sessionId))
    pendingInsights.set(sessionId, pending)
  }
  const insights = await pending
  if (hasData(insights)) await db`update onboarding_sessions set watch_insights = ${db.json(insights as never)} where id = ${sessionId}`.catch(() => undefined)
  return c.json(insights)
})
