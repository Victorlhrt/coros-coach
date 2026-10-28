import type { Context } from 'hono'
import { Hono } from 'hono'
import { KNOWN_RACES } from './data/races.js'
import { db } from './db.js'
import { SHOES } from './data/shoes.js'

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
