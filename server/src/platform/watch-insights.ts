import { normalizeActivities } from './coros-records.js'
import type { GarminConnection } from './garmin.js'

/**
 * Aperçu de la montre pendant l'onboarding : volume récent, plus longue sortie, meilleurs temps de l'année,
 * VO2max (donnée par la montre, sinon estimée par la VDOT du meilleur temps), allure seuil et prédictions.
 * Les calculs sont purs (vérifiés par scripts/check-insights.ts) ; les lectures COROS et Garmin sont branchées
 * par connect.ts. Toute lecture en échec donne des null, jamais une erreur.
 */

export type WatchProvider = 'coros' | 'garmin'
export type BestLabel = '5 km' | '10 km' | 'Half' | 'Marathon'
export type WatchBest = { label: BestLabel; meters: number; seconds: number; date: string | null }
export type WatchInsights = {
  source: WatchProvider
  /** Moyenne des 4 dernières semaines complètes (lundi-dimanche). */
  weeklyKm: number | null
  runsPerWeek: number | null
  /** Plus longue sortie des 12 dernières semaines. */
  longestRunKm: number | null
  /** Première activité connue (AAAA-MM-JJ), quand la montre la donne. */
  since: string | null
  bests: WatchBest[]
  vo2max: number | null
  /** true : VO2max estimée par la VDOT du meilleur temps, la montre ne la donnant pas. */
  vo2maxEstimated: boolean
  /** Allure seuil, s/km. */
  thresholdPace: number | null
  predictions: { label: BestLabel; seconds: number }[] | null
  /** Jours où la personne court d'habitude (8 dernières semaines), « mon » … « sun ». */
  usualDays: string[] | null
  longRunDay: string | null
  fetchedAt: string
}

/** Ce que le résumé lit d'une sortie : COROS et Garmin (Activity normalisée) ont ces champs. */
export type RunLike = { date: string; meters: number | null; seconds: number | null }
export type ToolCaller = (tool: string, args?: Record<string, unknown>) => Promise<unknown>

export const BEST_DISTANCES: { label: BestLabel; meters: number }[] = [
  { label: '5 km', meters: 5000 },
  { label: '10 km', meters: 10000 },
  { label: 'Half', meters: 21097.5 },
  { label: 'Marathon', meters: 42195 },
]
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_MS = 86_400_000

// --- VDOT (copie de src/lib/coach/vdot.ts) ---

const vo2AtSpeed = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v
const fractionAtDuration = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)
export function vdot(meters: number, seconds: number) {
  const t = seconds / 60
  return vo2AtSpeed(meters / t) / fractionAtDuration(t)
}

// --- Dates en jours (UTC, pour ne pas dépendre du fuseau du serveur) ---

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS)
/** 0 = lundi … 6 = dimanche */
const weekday = (day: number) => (((day + 3) % 7) + 7) % 7

export function emptyInsights(source: WatchProvider, now = new Date()): WatchInsights {
  return {
    source,
    weeklyKm: null,
    runsPerWeek: null,
    longestRunKm: null,
    since: null,
    bests: [],
    vo2max: null,
    vo2maxEstimated: false,
    thresholdPace: null,
    predictions: null,
    usualDays: null,
    longRunDay: null,
    fetchedAt: now.toISOString(),
  }
}

/** Au moins un chiffre à montrer. */
export function hasData(i: WatchInsights) {
  return i.weeklyKm !== null || i.longestRunKm !== null || i.bests.length > 0 || i.vo2max !== null || i.thresholdPace !== null
}

/** Volume, fréquence, plus longue sortie et jours habituels à partir des sorties des 12 dernières semaines. */
export function summarizeRuns(runs: RunLike[], now = new Date()) {
  const today = dayNumber(localIso(now))
  const monday = today - weekday(today)
  const valid = runs.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date) && (r.meters ?? 0) > 0)
  const inWindow = (from: number, to: number) => valid.filter((r) => dayNumber(r.date) >= from && dayNumber(r.date) < to)

  const last12 = inWindow(today - 83, today + 1)
  const last4 = inWindow(monday - 28, monday)
  const km = (rs: RunLike[]) => rs.reduce((s, r) => s + (r.meters ?? 0), 0) / 1000
  const hasHistory = last12.length > 0 || last4.length > 0

  // Jours habituels : sur 8 semaines complètes, les jours de la semaine où l'on a couru au moins 40 % des semaines actives.
  const last8 = inWindow(monday - 56, monday)
  const weeks = new Map<number, RunLike[]>()
  for (const r of last8) {
    const w = Math.floor((dayNumber(r.date) - (monday - 56)) / 7)
    weeks.set(w, [...(weeks.get(w) ?? []), r])
  }
  let usualDays: string[] | null = null
  let longRunDay: string | null = null
  if (weeks.size >= 3) {
    const need = Math.max(2, Math.ceil(weeks.size * 0.4))
    const counts = DAY_KEYS.map((_, d) => [...weeks.values()].filter((rs) => rs.some((r) => weekday(dayNumber(r.date)) === d)).length)
    const days = DAY_KEYS.filter((_, d) => counts[d] >= need)
    usualDays = days.length ? days : null
    const longest = [...weeks.values()].map((rs) => weekday(dayNumber(rs.reduce((a, b) => ((b.meters ?? 0) > (a.meters ?? 0) ? b : a)).date)))
    const mode = DAY_KEYS.map((_, d) => longest.filter((x) => x === d).length)
    const top = Math.max(...mode)
    if (top >= 3 && mode.filter((m) => m === top).length === 1) longRunDay = DAY_KEYS[mode.indexOf(top)]
  }

  return {
    weeklyKm: hasHistory ? Math.round(km(last4) / 4) : null,
    runsPerWeek: hasHistory ? Math.round((last4.length / 4) * 10) / 10 : null,
    longestRunKm: last12.length ? Math.round(Math.max(...last12.map((r) => r.meters ?? 0)) / 100) / 10 : null,
    usualDays,
    longRunDay,
  }
}

/** Meilleur temps par distance : sorties de cette longueur (+0 à 8 %), temps ramené à la distance exacte (comme fetchRecords). */
export function bestsFromRuns(runs: RunLike[]): WatchBest[] {
  return BEST_DISTANCES.flatMap((d) => {
    const best = runs
      .filter((r) => r.meters && r.seconds && r.meters >= d.meters * 0.99 && r.meters <= d.meters * 1.08)
      .map((r) => ({ date: r.date.slice(0, 10), seconds: Math.round(r.seconds! * (d.meters / r.meters!)) }))
      .sort((a, b) => a.seconds - b.seconds)[0]
    return best ? [{ label: d.label, meters: d.meters, seconds: best.seconds, date: best.date }] : []
  })
}

/** VO2max estimée : meilleure VDOT parmi les meilleurs temps (arrondie). */
export function estimateVo2max(bests: WatchBest[]) {
  const values = bests.map((b) => vdot(b.meters, b.seconds)).filter((v) => Number.isFinite(v) && v > 15 && v < 90)
  return values.length ? Math.round(Math.max(...values)) : null
}

// --- Lecture tolérante des réponses de forme (texte ou JSON) ---

/** JSON aplati en lignes « clé: valeur » ; un objet aux valeurs simples tient sur une ligne (« distance: 5K | time: 19:45 »). */
export function flatten(node: unknown, path = ''): string[] {
  if (node === null || node === undefined) return []
  if (typeof node !== 'object') return [`${path}: ${String(node)}`]
  const entries = Array.isArray(node) ? node.map((v, i) => [String(i), v] as const) : Object.entries(node)
  const simple = entries.filter(([, v]) => v === null || typeof v !== 'object')
  const nested = entries.filter(([, v]) => v !== null && typeof v === 'object')
  const line = simple
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `${Array.isArray(node) ? path : k}: ${String(v)}`)
    .join(' | ')
  return [...(line ? [`${path ? `${path} ` : ''}${line}`] : []), ...nested.flatMap(([k, v]) => flatten(v, path ? `${path}.${k}` : k))]
}

const toText = (raw: unknown) => (typeof raw === 'string' ? raw : flatten(raw).join('\n'))
const clockToSeconds = (s: string) => s.split(':').map(Number).reduce((a, p) => a * 60 + p, 0)

const PREDICTION_PATTERNS: { label: BestLabel; re: RegExp }[] = [
  { label: '5 km', re: /(?:\b5\s?k(?:m)?\b|five\s?k)[^0-9\n]{0,24}(\d{1,2}:\d{2}(?::\d{2})?|\d{3,5}(?![\d:.]))/gi },
  { label: '10 km', re: /(?:\b10\s?k(?:m)?\b|ten\s?k)[^0-9\n]{0,24}(\d{1,2}:\d{2}(?::\d{2})?|\d{3,5}(?![\d:.]))/gi },
  { label: 'Half', re: /(?:half[\s_-]?marathon|\bhalf\b|\b21[.,]1\s?k(?:m)?)[^0-9\n]{0,24}(\d{1,2}:\d{2}(?::\d{2})?|\d{4,5}(?![\d:.]))/gi },
  { label: 'Marathon', re: /(?<!half[\s_-]?)(?:full[\s_-]?)?marathon[^0-9\n]{0,24}(\d{1,2}:\d{2}(?::\d{2})?|\d{4,5}(?![\d:.]))/gi },
]

/** VO2max, allure seuil (s/km) et prédictions de course, où qu'ils soient dans la réponse. */
export function parseFitness(raw: unknown) {
  const text = toText(raw)
  const vo2Match = text.match(/vo2\s*_?max[^0-9\n]{0,24}(\d{2}(?:[.,]\d+)?)(?![\d.])/i)
  const vo2 = vo2Match ? parseFloat(vo2Match[1].replace(',', '.')) : null
  const thrMatch = text.match(/threshold[^\n]{0,40}?pace[^0-9\n]{0,16}(\d{1,2}:\d{2}|\d{3})(?![\d:])/i)
  const thr = thrMatch ? (thrMatch[1].includes(':') ? clockToSeconds(thrMatch[1]) : Number(thrMatch[1])) : null

  const predictions = PREDICTION_PATTERNS.flatMap(({ label, re }) => {
    const meters = BEST_DISTANCES.find((d) => d.label === label)!.meters
    for (const m of text.matchAll(re)) {
      // Minutes:secondes trop courtes pour la distance → c'est un h:mm (« 3:10 » pour un marathon).
      let seconds = m[1].includes(':') ? clockToSeconds(m[1]) : Number(m[1])
      if (m[1].split(':').length === 2 && seconds / (meters / 1000) < 150) seconds *= 60
      const pace = seconds / (meters / 1000)
      if (pace >= 150 && pace <= 600) return [{ label, seconds: Math.round(seconds) }]
    }
    return []
  })

  return {
    vo2max: vo2 !== null && vo2 >= 20 && vo2 <= 90 ? Math.round(vo2 * 10) / 10 : null,
    thresholdPace: thr !== null && thr >= 150 && thr <= 600 ? thr : null,
    predictions: predictions.length ? predictions : null,
  }
}

/** Date de création du compte ou de la première activité, si la réponse en donne une. */
export function parseSince(raw: unknown, now = new Date()) {
  const text = toText(raw)
  const m = text.match(/(?:regist|creat|join|since|first)[^\n]{0,40}?(\d{4})-?(\d{2})-?(\d{2})(?!\d)/i)
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`
    if (Date.parse(iso) > Date.UTC(2000, 0, 1) && Date.parse(iso) <= now.getTime()) return iso
  }
  const ts = text.match(/(?:regist|creat|join|since|first)\w*[^\n0-9]{0,12}(\d{10}|\d{13})(?!\d)/i)
  if (ts) {
    const n = Number(ts[1])
    const d = new Date(n > 1e12 ? n : n * 1000)
    if (d.getTime() > Date.UTC(2000, 0, 1) && d.getTime() <= now.getTime()) return localIso(d)
  }
  return null
}

/** Assemble l'aperçu ; la VO2max de la montre est prioritaire, sinon l'estimation par la VDOT. */
export function buildInsights(
  source: WatchProvider,
  parts: { recent: RunLike[]; bests: WatchBest[]; fitness?: unknown; userInfo?: unknown },
  now = new Date(),
): WatchInsights {
  const runs = summarizeRuns(parts.recent, now)
  const fitness = parts.fitness ? parseFitness(parts.fitness) : { vo2max: null, thresholdPace: null, predictions: null }
  const estimated = fitness.vo2max === null ? estimateVo2max(parts.bests) : null
  return {
    ...emptyInsights(source, now),
    ...runs,
    since: parts.userInfo ? parseSince(parts.userInfo, now) : null,
    bests: parts.bests,
    vo2max: fitness.vo2max ?? estimated,
    vo2maxEstimated: fitness.vo2max === null && estimated !== null,
    thresholdPace: fitness.thresholdPace,
    predictions: fitness.predictions,
  }
}

// --- Lectures COROS (outils MCP en lecture seule) ---

const RUN_CODES = [100, 101, 102, 103]
const coros = (d: Date) => localIso(d).replaceAll('-', '')
const daysAgo = (now: Date, n: number) => new Date(now.getTime() - n * DAY_MS)

/** querySportRecords déclare tous ses filtres requis : null d'abord, valeurs permissives sinon (comme src/lib/coros/data.ts). */
async function sportRecords(call: ToolCaller, now: Date, days: number, opts: { codes?: number[]; minKm?: number; maxKm?: number } = {}) {
  const base = { startDate: coros(daysAgo(now, days)), endDate: coros(now), sportTypeCodes: opts.codes ?? RUN_CODES, limit: 200 }
  try {
    return await call('querySportRecords', {
      ...base,
      minDistanceKm: opts.minKm ?? null,
      maxDistanceKm: opts.maxKm ?? null,
      minDurationMinutes: null,
      maxDurationMinutes: null,
      maxAveragePace: null,
      locationKeyword: null,
    })
  } catch {
    return call('querySportRecords', {
      ...base,
      minDistanceKm: opts.minKm ?? 0,
      maxDistanceKm: opts.maxKm ?? 1000,
      minDurationMinutes: 0,
      maxDurationMinutes: 6000,
      maxAveragePace: '59:59',
      locationKeyword: '',
    })
  }
}

export async function corosInsights(call: ToolCaller, now = new Date()): Promise<WatchInsights> {
  const safe = <T>(p: Promise<T>) => p.catch((e: unknown) => (console.error('[insights] lecture COROS', e instanceof Error ? e.message : e), null))
  const [recent, fitness, userInfo, ...records] = await Promise.all([
    safe(sportRecords(call, now, 84)),
    safe(call('queryFitnessAssessmentOverview')),
    safe(call('queryUserInfo')),
    // Une requête par distance (hors trail et tapis), sinon la limite de résultats couperait l'année.
    ...BEST_DISTANCES.map((d) =>
      safe(sportRecords(call, now, 365, { codes: [100, 103], minKm: Math.floor((d.meters / 1000) * 0.99 * 100) / 100, maxKm: Math.ceil((d.meters / 1000) * 1.08 * 100) / 100 })),
    ),
  ])
  const bests = BEST_DISTANCES.flatMap((d, i) => bestsFromRuns(normalizeActivities(records[i])).filter((b) => b.label === d.label))
  return buildInsights('coros', { recent: normalizeActivities(recent), bests, fitness, userInfo }, now)
}

// --- Garmin : fetchGarminRuns (server/src/platform/garmin.ts, clé Personal API) ---

/** Import à la demande : garmin.ts tire l'authentification et la base, inutiles aux vérifications hors ligne. */
export async function garminInsights(connection: GarminConnection, now = new Date()): Promise<WatchInsights> {
  const { fetchGarminRuns } = await import('./garmin.js')
  const runs = await fetchGarminRuns(connection, 365).catch((e: unknown) => {
    console.error('[insights] lecture Garmin', e instanceof Error ? e.message : e)
    return [] as RunLike[]
  })
  return buildInsights('garmin', { recent: runs, bests: bestsFromRuns(runs) }, now)
}

/** Résultat d'un outil MCP : `structuredContent`, sinon le texte (JSON si possible), comme src/lib/coros/client.ts. */
export function parseToolResult(raw: unknown): unknown {
  const result = (raw ?? {}) as { isError?: unknown; content?: unknown; structuredContent?: unknown }
  const texts = Array.isArray(result.content) ? result.content.flatMap((c: { type?: string; text?: string }) => (c.type === 'text' && c.text ? [c.text] : [])) : []
  if (result.isError) throw new Error(texts.join('\n') || 'COROS returned an error.')
  if (result.structuredContent) return result.structuredContent
  const joined = texts.join('\n')
  try {
    return JSON.parse(joined)
  } catch {
    return joined
  }
}
