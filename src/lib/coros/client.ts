import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { MCP_URL, SCOPES, isWriteTool } from './config'
import { useConfirm } from './confirm-store'
import { corosOAuth } from './oauth-provider'
import { useWriteLog } from './write-log'

export class CorosNotConnectedError extends Error {
  constructor() {
    super('COROS isn’t connected.')
  }
}

let clientPromise: Promise<Client> | null = null

async function connect() {
  const client = new Client({ name: 'coros-coach', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: corosOAuth })
  await client.connect(transport)
  return client
}

/** Client MCP partagé. Le serveur est sans session : une connexion suffit pour toute la vie de la page. */
export function getClient() {
  if (!corosOAuth.tokens()) return Promise.reject(new CorosNotConnectedError())
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null
      if (!corosOAuth.tokens()) throw new CorosNotConnectedError()
      throw err
    })
  }
  return clientPromise
}

/** Lance la connexion OAuth : enregistre le client si besoin puis redirige vers COROS. */
export async function startCorosLogin() {
  corosOAuth.allowRedirect = true
  try {
    await auth(corosOAuth, { serverUrl: MCP_URL, scope: SCOPES })
  } finally {
    corosOAuth.allowRedirect = false
  }
}

/** Retour de COROS : échange le code contre des tokens. */
export async function finishCorosLogin(code: string, state: string | null) {
  if (!corosOAuth.consumeState(state)) {
    throw new Error('Unexpected OAuth response (invalid state). Try connecting again.')
  }
  const result = await auth(corosOAuth, { serverUrl: MCP_URL, authorizationCode: code, scope: SCOPES })
  if (result !== 'AUTHORIZED') throw new Error('COROS authorization wasn’t granted.')
  clientPromise = null
}

export async function disconnectCoros() {
  const client = await clientPromise?.catch(() => null)
  await client?.close().catch(() => undefined)
  clientPromise = null
  corosOAuth.invalidateCredentials('tokens')
}

export async function listTools(): Promise<Tool[]> {
  const client = await getClient()
  const tools: Tool[] = []
  let cursor: string | undefined
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined)
    tools.push(...page.tools)
    cursor = page.nextCursor
  } while (cursor)
  return tools
}

/** Résultat d'un outil : `structuredContent` si présent, sinon le texte (JSON si possible). */
function parseResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n')
      : ''
    throw new Error(text || 'COROS returned an error.')
  }
  if (result.structuredContent) return result.structuredContent
  const texts = Array.isArray(result.content)
    ? result.content.flatMap((c) => (c.type === 'text' ? [c.text] : []))
    : []
  const joined = texts.join('\n')
  try {
    return JSON.parse(joined)
  } catch {
    return joined
  }
}

/** Lecture seule. Les outils d'écriture sont refusés ici : passer par `corosWrite`. */
export async function corosRead<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isWriteTool(tool)) throw new Error(`${tool} writes to COROS: use corosWrite.`)
  const client = await getClient()
  return parseResult(await client.callTool({ name: tool, arguments: args })) as T
}

/**
 * Point d'entrée unique de toute écriture sur COROS :
 * demande une confirmation, exécute, puis journalise le résultat.
 * Renvoie `null` si l'utilisateur annule.
 */
export async function corosWrite<T = unknown>(
  tool: string,
  args: Record<string, unknown>,
  summary: string,
): Promise<T | null> {
  const log = useWriteLog.getState().add
  const base = { id: crypto.randomUUID(), at: new Date().toISOString(), tool, summary, args }

  const ok = await useConfirm.getState().ask({
    title: 'Write to COROS?',
    description: summary,
    details: { tool, arguments: args },
    confirmLabel: 'Send',
  })
  if (!ok) {
    log({ ...base, status: 'cancelled' })
    return null
  }

  try {
    const client = await getClient()
    const result = parseResult(await client.callTool({ name: tool, arguments: args }))
    log({ ...base, status: 'ok', result })
    return result as T
  } catch (err) {
    log({ ...base, status: 'error', error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
