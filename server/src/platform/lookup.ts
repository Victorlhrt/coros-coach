import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import { KNOWN_RACES } from './data/races.js'
import { db } from './db.js'
import { SHOES } from './data/shoes.js'
import { findGravatar, gravatarHash, searchWebProfile, type WebProfile } from './profile-search.js'

/**
 * Recherches publiques de l'onboarding : profil UTMB (trail), courses (route + trail UTMB), chaussures.
 * Les appels externes sont mis en cache une heure et freinés par adresse IP.
 */
export const lookupRoutes = new Hono()

const UA = 'Mozilla/5.0 (compatible; Raice.run onboarding; +https://raice.run)'
const cache = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 3600_000) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
  return value
}

const hits = new Map<string, { count: number; reset: number }>()
function limited(c: Context) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const h = hits.get(ip)
  if (!h || h.reset < Date.now()) {
    hits.set(ip, { count: 1, reset: Date.now() + 60_000 })
    return false
  }
  h.count++
  return h.count > 60
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ---------- UTMB (trail) ----------

type UtmbSearch = { runners: { id: number; fullname: string; uri: string; ageGroup: string; nationality: string; ip: number; picture: string | null }[] }

lookupRoutes.get('/utmb/runners', async (c) => {
  if (limited(c)) return c.json({ error: 'Too many searches, wait a minute.' }, 429)
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 3) return c.json([])
  try {
    const data = await cached(`utmb:search:${normalize(q)}`, async () => {
      const res = await fetch(`https://api.utmb.world/search/runners?search=${encodeURIComponent(q)}&lang=fr&limit=6`, { headers: { 'user-agent': UA } })
      if (!res.ok) throw new Error(`UTMB ${res.status}`)
      return (await res.json()) as UtmbSearch
    })
    return c.json(
      data.runners.map((r) => ({
        uri: r.uri,
        name: r.fullname,
        ageGroup: r.ageGroup,
        nationality: r.nationality,
        index: r.ip || null,
        picture: r.picture ? `https://img.utmb.world/image/upload/c_fill,g_face,w_320,h_320/${r.picture}` : null,
      })),
    )
  } catch {
    return c.json({ error: 'UTMB search is unavailable right now.' }, 502)
  }
})

type UtmbResult = { dateIso: string; race: string; distance: string; elevationGain: number; time: string | null; rank?: number }

/** Profil public UTMB : résultats (date, course, distance, D+, temps) et indices de performance. */
lookupRoutes.get('/utmb/runner/:uri', async (c) => {
  if (limited(c)) return c.json({ error: 'Too many searches, wait a minute.' }, 429)
  const uri = c.req.param('uri')
  if (!/^\d+\.[a-z0-9.-]+$/i.test(uri)) return c.json({ error: 'Invalid profile' }, 400)
  try {
    const profile = await cached(`utmb:runner:${uri}`, async () => {
      const res = await fetch(`https://utmb.world/fr/runner/${uri}`, { headers: { 'user-agent': UA } })
      if (!res.ok) throw new Error(`UTMB ${res.status}`)
      const html = await res.text()
      const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
      if (!json) throw new Error('Page UTMB illisible')
      const pp = JSON.parse(json).props?.pageProps ?? {}
      const results: UtmbResult[] = pp.results?.results ?? []
      return {
        uri,
        name: pp.fullname as string,
        ageGroup: pp.ageGroup as string,
        indexes: ((pp.performanceIndexes ?? []) as { piCategory: string; index: number | null }[]).filter((i) => i.index),
        results: results.slice(0, 40).map((r) => ({
          date: r.dateIso,
          race: r.race,
          km: Number(r.distance) || 0,
          elevation: r.elevationGain ?? 0,
          time: r.time,
        })),
      }
    })
    return c.json(profile)
  } catch {
    return c.json({ error: 'UTMB profile is unavailable right now.' }, 502)
  }
})

// ---------- Profil public hors UTMB (Gravatar, recherche web) ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Photo Gravatar liée à l'e-mail (`url: null` sans photo). */
lookupRoutes.get('/gravatar', async (c) => {
  if (limited(c)) return c.json({ error: 'Too many searches, wait a minute.' }, 429)
  const email = (c.req.query('email') ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return c.json({ url: null })
  const url = await cached(`gravatar:${gravatarHash(email)}`, () => findGravatar(email))
  return c.json({ url })
})

// La recherche web coûte : 2 par parcours et 10 par heure et par adresse IP au plus.
const webBySession = new Map<string, number>()
const webByIp = new Map<string, { count: number; reset: number }>()
function webLimited(c: Context, sessionId: string) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const h = webByIp.get(ip)
  if (!h || h.reset < Date.now()) webByIp.set(ip, { count: 1, reset: Date.now() + 3600_000 })
  else if (++h.count > 10) return true
  const n = (webBySession.get(sessionId) ?? 0) + 1
  webBySession.set(sessionId, n)
  if (webBySession.size > 5000) webBySession.delete(webBySession.keys().next().value as string)
  return n > 2
}

const WebProfileBody = z.object({
  sessionId: z.string().uuid(),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  city: z.string().trim().max(80).optional(),
})

/**
 * Résultats publics trouvés en ligne (ITRA, Betrail, FFA, DUV…) et photos candidates.
 * Réservé aux parcours d'onboarding en cours ; le résultat est gardé 30 jours sur le lead.
 * Sans résultat possible (clé absente, budget atteint, délai dépassé), renvoie `profile: null` sans erreur.
 */
lookupRoutes.post('/web-profile', async (c) => {
  const parsed = WebProfileBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ profile: null })
  const { sessionId, firstName, lastName, email, city } = parsed.data
  const [s] = await db<{ user_id: string | null; is_preview: boolean }[]>`select user_id, is_preview from onboarding_sessions where id = ${sessionId}`
  if (!s) return c.json({ profile: null })
  const [lead] = await db<{ web_profile: WebProfile | null; fresh: boolean; first_name: string; last_name: string }[]>`
    select web_profile, web_profile_at > now() - interval '30 days' fresh, first_name, last_name from leads where email = ${email}`
  const sameName = lead && normalize(`${lead.first_name} ${lead.last_name}`) === normalize(`${firstName} ${lastName}`)
  if (lead?.web_profile && lead.fresh && sameName) return c.json({ profile: lead.web_profile })
  const key = `web:${normalize(`${firstName} ${lastName}`)}:${normalize(city ?? '')}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 3600_000) return c.json({ profile: hit.value })
  if (webLimited(c, sessionId)) return c.json({ profile: null })

  const profile = await searchWebProfile({ firstName, lastName, city, userId: s.user_id })
  if (profile) {
    cache.set(key, { at: Date.now(), value: profile })
    if (!s.is_preview) await db`update leads set web_profile = ${db.json(profile as never)}, web_profile_at = now(), updated_at = now() where email = ${email}`
  }
  return c.json({ profile })
})

// ---------- Courses ----------

type UtmbRaces = {
  races: { id: number; name: string; startDate: string; startLocation: string; details?: { statsUp?: { name: string; value: number | string }[] } }[]
}

/** Tranches de distance du filtre : route en catégories classiques, trail par longueur. */
const DIST: Record<string, (km: number) => boolean> = {
  '5k': (km) => km >= 4 && km <= 7,
  '10k': (km) => km > 7 && km <= 15,
  half: (km) => km > 15 && km <= 30,
  marathon: (km) => km > 30 && km <= 45,
  'trail-short': (km) => km < 30,
  'trail-mid': (km) => km >= 30 && km < 60,
  'trail-long': (km) => km >= 60 && km < 100,
  ultra: (km) => km >= 100,
}

type RaceOut = { id: string; name: string; detail: string; km: number; elevation: number; date: string | null; source: 'raice' | 'utmb' }

lookupRoutes.get('/races', async (c) => {
  if (limited(c)) return c.json({ error: 'Too many searches, wait a minute.' }, 429)
  const q = normalize((c.req.query('q') ?? '').trim())
  const type = c.req.query('type') === 'trail' ? 'trail' : 'road'
  const inDist = DIST[c.req.query('dist') ?? ''] ?? (() => true)

  const known: RaceOut[] = KNOWN_RACES.filter((r) => r.terrain === type && (!q || normalize(`${r.name} ${r.city}`).includes(q))).flatMap((r) =>
    r.distances.map((d) => ({
      id: `${r.id}:${d.km}`,
      name: r.name,
      detail: d.elevation ? `${d.label} · ≈ ${d.elevation} m D+ · ${r.city}` : `${d.label} · ${r.city}`,
      km: d.km,
      elevation: d.elevation ?? 0,
      date: null,
      source: 'raice' as const,
    })),
  )
  let utmb: RaceOut[] = []
  if (type === 'trail') {
    try {
      const data = await cached(`utmb:races:${q}`, async () => {
        const res = await fetch(`https://api.utmb.world/search/races?lang=fr&limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}`, { headers: { 'user-agent': UA } })
        if (!res.ok) throw new Error(`UTMB ${res.status}`)
        return (await res.json()) as UtmbRaces
      })
      utmb = data.races
        .map((r) => {
          const stat = (n: string) => Number(r.details?.statsUp?.find((s) => s.name === n)?.value ?? 0)
          return { id: `utmb:${r.id}`, name: r.name, detail: `${stat('distance')} km · ${stat('elevationGain')} m D+ · ${r.startLocation}`, km: stat('distance'), elevation: stat('elevationGain'), date: r.startDate, source: 'utmb' as const }
        })
        // L'API UTMB ne filtre pas toujours sur le nom : on le fait ici.
        .filter((r) => !q || normalize(`${r.name} ${r.detail}`).includes(q))
    } catch {
      // UTMB indisponible : on garde les courses connues.
    }
  }
  return c.json([...known, ...utmb].filter((r) => inDist(r.km)).slice(0, 30))
})

// ---------- Chaussures ----------

/** Marques de chaussures de running (celles de la liste de modèles, plus d'autres courantes). */
const EXTRA_BRANDS = ['Merrell', 'Topo Athletic', 'Craft', 'Diadora', 'Under Armour', 'Reebok', 'Joma', 'Veja', 'Norda', 'VJ', 'Dynafit', 'Arc’teryx', 'The North Face', 'Columbia', 'Karhu', 'Newton']

lookupRoutes.get('/shoes', (c) => c.json(SHOES.map((s) => ({ id: normalize(`${s.brand}-${s.model}`).replace(/[^a-z0-9]+/g, '-'), ...s }))))

lookupRoutes.get('/shoe-brands', (c) =>
  c.json([...new Set([...SHOES.map((s) => s.brand), ...EXTRA_BRANDS])].sort((a, b) => a.localeCompare(b, 'fr'))),
)

// ---------- Géocodage des villes (carte du Leaderboard) ----------

/** Villes proposées à l'onboarding : coordonnées fixes, sans appel à Nominatim. */
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  paris: { lat: 48.8566, lon: 2.3522 },
  lyon: { lat: 45.764, lon: 4.8357 },
  marseille: { lat: 43.2965, lon: 5.3698 },
  bordeaux: { lat: 44.8378, lon: -0.5792 },
  lille: { lat: 50.6292, lon: 3.0573 },
  toulouse: { lat: 43.6047, lon: 1.4442 },
  nantes: { lat: 47.2184, lon: -1.5536 },
  annecy: { lat: 45.8992, lon: 6.1294 },
  chamonix: { lat: 45.9237, lon: 6.8694 },
  grenoble: { lat: 45.1885, lon: 5.7245 },
}

// Nominatim : une requête par seconde au plus pour tout le serveur, résultats gardés 30 jours (échecs compris).
const geoCache = new Map<string, { at: number; value: { lat: number; lon: number } | null }>()
let nominatimQueue: Promise<unknown> = Promise.resolve()
function nominatim(q: string) {
  const run = nominatimQueue.then(async () => {
    const started = Date.now()
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { 'user-agent': 'Raice.run (contact@raice.run)', 'accept-language': 'en' },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) throw new Error(`Nominatim ${res.status}`)
      const [hit] = (await res.json()) as { lat: string; lon: string }[]
      const lat = Number(hit?.lat)
      const lon = Number(hit?.lon)
      return hit && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
    } finally {
      await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - started))))
    }
  })
  nominatimQueue = run.catch(() => undefined)
  return run
}

lookupRoutes.get('/geocode', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return c.json({ lat: null, lon: null })
  const key = normalize(q).replace(/\s+/g, ' ')
  const preset = CITY_COORDS[key.split(',')[0]!.trim()]
  if (preset) return c.json(preset)
  const hit = geoCache.get(key)
  if (hit && Date.now() - hit.at < 30 * 86_400_000) return c.json(hit.value ?? { lat: null, lon: null })
  if (limited(c)) return c.json({ error: 'Too many searches, wait a minute.' }, 429)
  try {
    const value = await nominatim(q)
    geoCache.set(key, { at: Date.now(), value })
    if (geoCache.size > 5000) geoCache.delete(geoCache.keys().next().value as string)
    return c.json(value ?? { lat: null, lon: null })
  } catch {
    return c.json({ error: 'Map lookup is unavailable right now.' }, 502)
  }
})

// ---------- Statistiques de la communauté ----------

/**
 * Part des coureurs de Raice.run (onboardings réels, hors aperçus) sous la valeur donnée.
 * Rien n'est renvoyé tant que l'échantillon est trop petit pour que la statistique ait un sens.
 */
const MIN_SAMPLE = 30
lookupRoutes.get('/stats/weekly-km', async (c) => {
  const value = Number(c.req.query('value'))
  if (!Number.isFinite(value) || value < 0) return c.json({ percentile: null, sample: 0 })
  const [row] = await cached(`stats:weekly-km:${Math.round(value)}`, () =>
    db<{ below: number; total: number }[]>`
      select count(*) filter (where (answers->>'weekly_km')::numeric < ${value})::int below, count(*)::int total
      from onboarding_sessions
      where not is_preview and jsonb_typeof(answers->'weekly_km') = 'number'`,
  )
  if (!row || row.total < MIN_SAMPLE) return c.json({ percentile: null, sample: row?.total ?? 0 })
  return c.json({ percentile: Math.round((row.below / row.total) * 100), sample: row.total })
})
