import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import { budgetStatus, recordUsage } from './ai-usage.js'

/**
 * Recherche du profil public d'un coureur, au-delà d'UTMB :
 * - photo Gravatar liée à l'e-mail (gratuit, sans IA) ;
 * - recherche web côté serveur (outil web_search d'Anthropic) sur les sites de résultats (ITRA, Betrail, FFA, DUV, Finishers, Kikourou…).
 * Tout échec (pas de clé, budget atteint, délai dépassé, réponse illisible) renvoie `null` : l'onboarding continue sans.
 * LinkedIn et les réseaux sociaux sont exclus (conditions d'utilisation).
 */

const MODEL = process.env.PROFILE_SEARCH_MODEL ?? 'claude-sonnet-5'
const TIMEOUT_MS = 90_000
const UA = 'Mozilla/5.0 (compatible; Raice.run onboarding; +https://raice.run)'

// ---------- Gravatar ----------

export const gravatarHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/** Adresse de la photo Gravatar, ou `null` si l'e-mail n'en a pas (`d=404`). */
export async function findGravatar(email: string): Promise<string | null> {
  const url = `https://gravatar.com/avatar/${gravatarHash(email)}?s=400&d=404`
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) })
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/') ? url : null
  } catch {
    return null
  }
}

// ---------- Recherche web ----------

export type WebProfile = {
  found: boolean
  summary: string | null
  sources: { site: string; url: string; title: string }[]
  results: { date: string | null; race: string; distance: string | null; time: string | null; rank: string | null; url: string | null }[]
  photos: { url: string; source: string; pageUrl: string | null }[]
}

const SYSTEM = `Tu aides une application d'entraînement à la course à pied à retrouver les résultats publics d'un coureur qui vient de s'inscrire et a donné son accord.
Cherche ses résultats de course sur les sites de résultats publics : ITRA (itra.run), Betrail (betrail.run), base de la FFA (bases.athle.fr), DUV Ultra Marathon Statistics (statistik.d-u-v.org), Finishers (finishers.com), Kikourou (kikourou.net), UTMB (utmb.world), Live Trail, sites de chronométrage.
N'utilise ni LinkedIn, ni Facebook, ni Instagram, ni aucun réseau social.
Les homonymes sont fréquents : ne retiens un résultat que s'il correspond clairement à la même personne (nom et prénom exacts, et ville ou région cohérente quand elle est connue). Dans le doute, ne le retiens pas.
Pour les photos, ne propose que l'adresse directe d'une image de profil publique (photo de coureur sur un profil ITRA, Betrail, UTMB…), jamais une photo de groupe ni une image dont tu n'es pas sûr.
Réponds uniquement par un objet JSON, sans texte autour, de la forme :
{"found": boolean, "summary": string|null, "sources": [{"site": string, "url": string, "title": string}], "results": [{"date": "AAAA-MM-JJ"|null, "race": string, "distance": string|null, "time": string|null, "rank": string|null, "url": string|null}], "photos": [{"url": string, "source": string, "pageUrl": string|null}]}
"summary" est une phrase courte en anglais. Au plus 8 sources, 15 résultats (les plus récents ou marquants) et 3 photos.`

const httpsUrl = (v: unknown) => {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && !/(^|\.)linkedin\.com$/i.test(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])

/** Ne garde que les photos qui répondent bien par une image (le modèle peut se tromper d'adresse). */
async function isImage(url: string) {
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) })
    void res.body?.cancel()
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')
  } catch {
    return false
  }
}

async function parseProfile(text: string): Promise<WebProfile | null> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const sources = arr(raw.sources)
    .map((s) => ({ site: str(s.site, 60) ?? '', url: httpsUrl(s.url) ?? '', title: str(s.title) ?? '' }))
    .filter((s) => s.url)
    .slice(0, 8)
  const results = arr(raw.results)
    .map((r) => ({
      date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
      race: str(r.race) ?? '',
      distance: str(r.distance, 40),
      time: str(r.time, 20),
      rank: str(r.rank, 40),
      url: httpsUrl(r.url),
    }))
    .filter((r) => r.race)
    .slice(0, 15)
  const candidates = arr(raw.photos)
    .map((p) => ({ url: httpsUrl(p.url) ?? '', source: str(p.source, 60) ?? 'Web', pageUrl: httpsUrl(p.pageUrl) }))
    .filter((p) => p.url)
    .slice(0, 3)
  const checks = await Promise.all(candidates.map((p) => isImage(p.url)))
  const photos = candidates.filter((_, i) => checks[i])
  return { found: raw.found === true && (sources.length > 0 || results.length > 0), summary: str(raw.summary, 300), sources, results, photos }
}

/**
 * Lance la recherche web (quelques recherches au plus) et renvoie un profil structuré, ou `null` si elle n'a pas pu se faire.
 * Chaque réponse est comptée dans le suivi de l'IA et la recherche est sautée quand le budget du mois est atteint.
 */
export async function searchWebProfile(p: { firstName: string; lastName: string; city?: string | null; userId?: string | null }): Promise<WebProfile | null> {
  if (!config.anthropicKey) return null
  try {
    if ((await budgetStatus()).blocked) return null
  } catch {
    return null
  }
  const client = new Anthropic({ apiKey: config.anthropicKey, timeout: TIMEOUT_MS, maxRetries: 0 })
  const who = `${p.firstName} ${p.lastName}`.trim()
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Coureur : ${who}${p.city ? `, qui court à ${p.city}` : ''}. Trouve ses résultats publics et, si possible, une photo de profil publique.`,
    },
  ]
  const deadline = Date.now() + TIMEOUT_MS
  try {
    // `pause_turn` : la recherche côté serveur a été interrompue, on la relance avec la réponse partielle (deux fois au plus).
    for (let turn = 0; turn < 3; turn++) {
      const res = await client.messages.create(
        {
          model: MODEL,
          max_tokens: 8000,
          system: SYSTEM,
          output_config: { effort: 'low' },
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5, blocked_domains: ['linkedin.com', 'facebook.com', 'instagram.com'] }],
          messages,
        },
        { timeout: Math.max(5000, deadline - Date.now()) },
      )
      await recordUsage(p.userId ?? null, res.model, {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
        server_tool_use: { web_search_requests: res.usage.server_tool_use?.web_search_requests ?? 0 },
      }).catch((err) => console.error('Enregistrement de l’usage IA impossible', err))
      if (res.stop_reason === 'pause_turn' && Date.now() < deadline) {
        messages.push({ role: 'assistant', content: res.content })
        continue
      }
      if (res.stop_reason === 'refusal') return null
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      return await parseProfile(text)
    }
    return null
  } catch (err) {
    console.error('Recherche web du profil impossible', err instanceof Error ? err.message : err)
    return null
  }
}
