/**
 * Calendriers publics de courses, en complément des courses connues et de l'API UTMB :
 * - Trace de Trail (tracedetrail.fr) : le calendrier trail mois par mois (JSON du site, robots.txt ouvert) ;
 * - Sports'n Connect (new.sportsnconnect.com) : les éditions publiées sur /client/events (données de la page Next.js).
 * Chargés au plus une fois par jour et gardés en mémoire ; une source en panne ne bloque jamais la recherche.
 */

const UA = 'Mozilla/5.0 (compatible; Raice.run onboarding; +https://raice.run)'
const DAY_MS = 86_400_000
const TIMEOUT_MS = 20_000

export type SourcedRace = {
  id: string
  name: string
  detail: string
  km: number
  elevation: number
  date: string | null
  source: 'tdt' | 'snc'
  terrain: 'road' | 'trail'
  /** Texte de recherche (nom, lieu, département). */
  haystack: string
  /** Code pays ISO (« FR »), pour classer les courses proches en tête. */
  country: string | null
}

type Obj = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const km1 = (km: number) => Math.round(km * 10) / 10
const fmtKm = (km: number) => `${km1(km).toLocaleString('fr-FR')} km`

/** Mise en cache d'une journée, avec un seul chargement en vol ; en cas d'échec, l'ancienne liste reste servie. */
function daily(load: () => Promise<SourcedRace[]>) {
  let value: SourcedRace[] = []
  let at = 0
  let inflight: Promise<SourcedRace[]> | null = null
  return async () => {
    if (Date.now() - at < DAY_MS) return value
    inflight ??= load()
      .then((v) => {
        value = v
        at = Date.now()
        return v
      })
      .catch((e) => {
        console.error('[races] source', e instanceof Error ? e.message : e)
        // Nouvel essai dans une heure plutôt qu'à chaque recherche.
        at = Date.now() - DAY_MS + 3600_000
        return value
      })
      .finally(() => (inflight = null))
    return inflight
  }
}

/** Une ligne par distance d'une épreuve, sans doublons (même distance à 100 m près) ni distances de moins de 3 km. */
function perDistance(base: Omit<SourcedRace, 'id' | 'km' | 'detail' | 'elevation'> & { key: string; place: string }, kms: number[]) {
  const seen = new Set<number>()
  return kms
    .filter((km) => km >= 3 && km <= 400)
    .sort((a, b) => b - a)
    .filter((km) => !seen.has(km1(km)) && seen.add(km1(km)))
    .map((km) => ({
      id: `${base.source}:${base.key}:${km1(km)}`,
      name: base.name,
      detail: [fmtKm(km), base.place].filter(Boolean).join(' · '),
      km: km1(km),
      elevation: 0,
      date: base.date,
      source: base.source,
      terrain: base.terrain,
      haystack: base.haystack,
      country: base.country,
    }))
}

// ---------- Trace de Trail ----------

/** Calendrier Trace de Trail des 12 prochains mois (tous pays), un appel par mois. */
export const traceDeTrailRaces = daily(async () => {
  const out: SourcedRace[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
    const res = await fetch('https://tracedetrail.fr/event/getEventsCalendar/all/all/all', {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest', referer: 'https://tracedetrail.fr/fr/calendar' },
      body: `month=${d.getUTCMonth() + 1}&year=${d.getUTCFullYear()}`,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Trace de Trail ${res.status}`)
    const json = (await res.json().catch(() => null)) as { data?: Obj[] } | null
    const today = new Date().toISOString().slice(0, 10)
    for (const e of json?.data ?? []) {
      const name = str(e.nom)
      // Le mois en cours contient aussi les courses déjà passées.
      if (!name || (str(e.dateFin) ?? str(e.dateDeb) ?? today) < today) continue
      const place = [str(e.localite), str(e.country) !== 'FR' ? str(e.country) : null].filter(Boolean).join(', ')
      const kms = String(e.distances ?? '')
        .split('_')
        .map(Number)
        .filter((n) => Number.isFinite(n))
      out.push(
        ...perDistance(
          {
            key: String(e.evtID),
            name,
            place,
            date: str(e.dateDeb),
            source: 'tdt',
            // Calendrier trail : une course n'y est « route » que si tous ses formats le sont et que son nom ne dit pas trail.
            terrain: /^(courseroute_?)+$/.test(String(e.sports ?? '')) && !/trail/i.test(name) ? 'road' : 'trail',
            country: str(e.country),
            haystack: `${name} ${e.localite ?? ''} ${e.regionLib ?? ''} ${e.depcode ?? ''}`,
          },
          kms,
        ),
      )
    }
    // Un appel par seconde au plus : on reste un visiteur discret.
    await new Promise((r) => setTimeout(r, 1000))
  }
  return out
})

// ---------- Sports'n Connect ----------

const SNC_TRAIL = /trail|nature|ultra/i
const SNC_ROAD = /route/i

/** Éditions de course à pied publiées sur Sports'n Connect (la page les embarque toutes dans __NEXT_DATA__). */
export const sportsNConnectRaces = daily(async () => {
  const res = await fetch('https://new.sportsnconnect.com/client/events', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Sports'n Connect ${res.status}`)
  const html = await res.text()
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!raw) throw new Error("Sports'n Connect : données de page absentes")
  const editions = ((JSON.parse(raw) as { props?: { pageProps?: { initialEditions?: Obj[] } } }).props?.pageProps?.initialEditions ?? []) as Obj[]
  const today = new Date().toISOString().slice(0, 10)
  return editions.flatMap((e) => {
    const event = (e.event ?? {}) as Obj
    const cats = ((event.sportCategories ?? []) as Obj[]).map((c) => String(c.name ?? ''))
    const terrain = cats.some((c) => SNC_TRAIL.test(c)) ? 'trail' : cats.some((c) => SNC_ROAD.test(c)) ? 'road' : null
    const name = str(event.title) ?? str(e.intro)
    const date = str(e.startDate)?.slice(0, 10) ?? null
    if (!terrain || !name || /\btest\b/i.test(name) || e.testMode || (date && date < today)) return []
    // Distances saisies par les organisateurs, parfois fausses : un semi ou un marathon sur route prend sa distance officielle.
    const given = ((e.trials ?? []) as Obj[]).map((t) => Number(t.distance) / 1000).filter((n) => Number.isFinite(n) && n > 0)
    const kms = terrain === 'road' && /semi/i.test(name) ? [21.1] : terrain === 'road' && /marathon/i.test(name) ? [42.195] : given
    const city = str(e.city)
    return perDistance(
      { key: String(e.uuid), name, place: [city, str(e.departmentCode)].filter(Boolean).join(' · '), date, source: 'snc', terrain, country: str(e.country), haystack: `${name} ${city ?? ''} ${e.department ?? ''} ${e.departmentCode ?? ''}` },
      kms,
    )
  })
})
