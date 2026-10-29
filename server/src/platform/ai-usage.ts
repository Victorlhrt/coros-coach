import { Hono } from 'hono'
import { requireAdmin, type SessionUser } from './auth.js'
import { audit, db, getSetting } from './db.js'

/**
 * Suivi de la consommation de l'IA : chaque appel relayé vers Anthropic est enregistré (tokens et coût),
 * et le relais refuse les nouveaux appels quand le budget du mois est atteint (arrêt net).
 * Le budget se règle dans le back office (20 € par défaut) ; les prix sont ceux de l'API Anthropic en dollars.
 */

export const DEFAULT_BUDGET_EUR = 20
/** Conversion des prix Anthropic (en dollars) vers l'euro. */
const USD_TO_EUR = Number(process.env.AI_USD_TO_EUR ?? 0.86)

/** Prix par million de tokens : entrée, sortie, lecture du cache (écriture du cache = 1,25 × l'entrée). */
type Price = { input: number; output: number; cacheRead?: number }
const PRICES: (Price & { prefix: string })[] = [
  { prefix: 'claude-haiku-4-5', input: 1, output: 5 },
  { prefix: 'claude-sonnet-5', input: 2, output: 10 },
  { prefix: 'claude-sonnet-4', input: 3, output: 15 },
  { prefix: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2 },
  { prefix: 'claude-opus-5', input: 5, output: 25 },
  { prefix: 'claude-opus-4-8', input: 5, output: 25 },
  { prefix: 'claude-opus-4-7', input: 5, output: 25 },
  { prefix: 'claude-opus-4-6', input: 5, output: 25 },
  { prefix: 'claude-opus-4-5', input: 5, output: 25 },
  { prefix: 'claude-fable-5-1', input: 10, output: 50, cacheRead: 0.25 },
  { prefix: 'claude-fable-5', input: 10, output: 50 },
]
// Modèle inconnu : on compte au prix le plus haut plutôt que de sous-estimer.
const FALLBACK: Price = { input: 10, output: 50 }

export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  /** Recherches web côté serveur (10 $ les 1 000), facturées en plus des tokens. */
  server_tool_use?: { web_search_requests?: number } | null
}
const WEB_SEARCH_USD = 0.01

export function costUsd(model: string, u: Usage) {
  const p: Price = PRICES.find((x) => model.startsWith(x.prefix)) ?? FALLBACK
  const cacheRead = p.cacheRead ?? p.input * 0.1
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * cacheRead) /
      1_000_000 +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD
  )
}

export async function migrateAiUsage() {
  await db`
    create table if not exists ai_usage (
      id bigserial primary key,
      user_id uuid references users(id) on delete set null,
      model text not null,
      input_tokens int not null default 0,
      output_tokens int not null default 0,
      cache_write_tokens int not null default 0,
      cache_read_tokens int not null default 0,
      cost_usd numeric(12, 6) not null default 0,
      created_at timestamptz not null default now()
    )`
  await db`create index if not exists ai_usage_created_idx on ai_usage (created_at)`
}

export async function recordUsage(userId: string | null, model: string, u: Usage) {
  await db`
    insert into ai_usage (user_id, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
    values (${userId}, ${model}, ${u.input_tokens ?? 0}, ${u.output_tokens ?? 0}, ${u.cache_creation_input_tokens ?? 0}, ${u.cache_read_input_tokens ?? 0}, ${costUsd(model, u)})`
}

async function budgetEur() {
  const v = Number(await getSetting<number>('ai_budget_eur', DEFAULT_BUDGET_EUR))
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_BUDGET_EUR
}

/** Dépense du mois civil en cours (heure de Paris) et budget. */
export async function budgetStatus() {
  const [row] = await db<{ usd: string }[]>`
    select coalesce(sum(cost_usd), 0) usd from ai_usage
    where created_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`
  const spentEur = Number(row?.usd ?? 0) * USD_TO_EUR
  const capEur = await budgetEur()
  return { spentEur, capEur, blocked: spentEur >= capEur }
}

/**
 * Lit l'usage dans la réponse d'Anthropic, en flux SSE (message_start puis message_delta) ou en JSON,
 * sans retarder la réponse envoyée au navigateur.
 */
export async function meterResponse(body: ReadableStream<Uint8Array>, isStream: boolean, onUsage: (model: string, u: Usage) => Promise<void>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let model = 'unknown'
  const usage: Usage = {}
  const merge = (u?: Usage) => {
    if (!u) return
    for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'] as const) {
      if (typeof u[k] === 'number') usage[k] = u[k]
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (!isStream) continue
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        try {
          const ev = JSON.parse(line.slice(5).trim()) as { type?: string; message?: { model?: string; usage?: Usage }; usage?: Usage }
          if (ev.type === 'message_start') {
            model = ev.message?.model ?? model
            merge(ev.message?.usage)
          } else if (ev.type === 'message_delta') merge(ev.usage)
        } catch {
          /* ligne incomplète ou ping : ignorée */
        }
      }
    }
    if (!isStream) {
      const msg = JSON.parse(buffer) as { model?: string; usage?: Usage }
      model = msg.model ?? model
      merge(msg.usage)
    }
  } catch (err) {
    console.error('Lecture de l’usage IA impossible', err)
  }
  if (usage.input_tokens || usage.output_tokens) await onUsage(model, usage).catch((err) => console.error('Enregistrement de l’usage IA impossible', err))
}

// ---------- Back office ----------

type Env = { Variables: { user: SessionUser } }
export const aiUsageRoutes = new Hono<Env>()
aiUsageRoutes.use('*', requireAdmin)

aiUsageRoutes.get('/', async (c) => {
  const status = await budgetStatus()
  const daily = await db<{ dt: string; usd: string; input: number; output: number; calls: number }[]>`
    select to_char(d, 'YYYY-MM-DD') dt,
           coalesce(sum(u.cost_usd), 0) usd,
           coalesce(sum(u.input_tokens + u.cache_write_tokens + u.cache_read_tokens), 0)::int input,
           coalesce(sum(u.output_tokens), 0)::int output,
           count(u.id)::int calls
    from generate_series((now() at time zone 'Europe/Paris')::date - 29, (now() at time zone 'Europe/Paris')::date, interval '1 day') d
    left join ai_usage u on (u.created_at at time zone 'Europe/Paris')::date = d::date
    group by d order by d`
  const byModel = await db<{ model: string; usd: string; calls: number }[]>`
    select model, sum(cost_usd) usd, count(*)::int calls from ai_usage
    where created_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
    group by model order by usd desc`
  const byUser = await db<{ name: string | null; email: string | null; usd: string; calls: number }[]>`
    select u.name, u.email, sum(a.cost_usd) usd, count(*)::int calls from ai_usage a left join users u on u.id = a.user_id
    where a.created_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
    group by u.name, u.email order by usd desc limit 8`
  const eur = (usd: string) => Number(usd) * USD_TO_EUR
  return c.json({
    ...status,
    usdToEur: USD_TO_EUR,
    daily: daily.map((d) => ({ day: d.dt, eur: eur(d.usd), input: d.input, output: d.output, calls: d.calls })),
    byModel: byModel.map((m) => ({ model: m.model, eur: eur(m.usd), calls: m.calls })),
    byUser: byUser.map((u) => ({ name: u.name ?? 'Personal coach', email: u.email, eur: eur(u.usd), calls: u.calls })),
  })
})

aiUsageRoutes.put('/budget', async (c) => {
  const { capEur } = await c.req.json<{ capEur?: number }>().catch(() => ({ capEur: undefined }))
  if (typeof capEur !== 'number' || !Number.isFinite(capEur) || capEur <= 0 || capEur > 10000) return c.json({ error: 'Budget must be between €0 and €10,000.' }, 400)
  await db`insert into app_settings (key, value) values ('ai_budget_eur', ${db.json(capEur)}) on conflict (key) do update set value = excluded.value, updated_at = now()`
  await audit(c.get('user').id, 'ai_budget.update', 'ai_budget_eur', { capEur })
  return c.json({ capEur })
})
