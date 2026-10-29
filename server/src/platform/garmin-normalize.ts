import { Decoder, Stream } from '@garmin/fitsdk'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'

/**
 * Lecture des réponses de l'API Personal de Garmin Connect, sans accès réseau ni base (testé par scripts/check-garmin.ts).
 * Formes tirées de la spécification OpenAPI officielle (developer.garmin.com/gc-developer-program/personal/swagger-docs/) :
 * `SummarizedActivityDTO` pour la liste, fichier d'origine (ZIP contenant le .FIT) pour les tours.
 */

/** Même forme que `Activity` côté app (src/lib/coros/activities.ts). */
export interface GarminActivity {
  labelId: string
  sportType: number
  date: string
  name: string
  place: string | null
  meters: number | null
  seconds: number | null
  paceSecPerKm: number | null
  avgHr: number | null
  /** Départ en UTC (epoch ms), pour dédoublonner une sortie présente aussi sur COROS. */
  startMs: number | null
}

/** Même forme que `Lap` côté app (src/lib/coros/laps.ts). */
export interface GarminLap {
  index: number
  meters: number | null
  seconds: number | null
  paceSecPerKm: number | null
  avgHr: number | null
}

export const GARMIN_PREFIX = 'garmin:'

type Obj = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Codes de sport façon COROS utilisés par l'app : 100 course, 101 tapis, 102 trail, 103 piste.
 * Garmin : type parent `running` (typeId 1), sous-types rattachés par `parentTypeId` = 1.
 */
export function garminSportType(typeKey: string | null): number {
  switch (typeKey) {
    case 'treadmill_running':
    case 'indoor_running':
    case 'virtual_run':
      return 101
    case 'trail_running':
      return 102
    case 'track_running':
      return 103
    default:
      return 100
  }
}

export function isGarminRun(type: Obj | null | undefined) {
  if (!type) return false
  const key = str(type.typeKey) ?? ''
  return type.typeId === 1 || type.parentTypeId === 1 || key === 'running' || /(^|_)run(ning)?($|_)/.test(key)
}

/** « 2026-08-31 17:01:18 » (heure locale de l'activité) → « 2026-08-31 ». */
function localDate(o: Obj) {
  const m = String(o.startTimeLocal ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function startMs(o: Obj) {
  const ts = num(o.beginTimestamp)
  if (ts) return ts
  const gmt = String(o.startTimeGMT ?? '')
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(gmt)) return null
  const t = Date.parse(`${gmt.replace(' ', 'T')}Z`)
  return Number.isFinite(t) ? t : null
}

/** Réponse de /activitylist-service/activities/search/activities → sorties de course, les plus récentes d'abord. */
export function normalizeGarminActivities(raw: unknown): GarminActivity[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((o): o is Obj => !!o && typeof o === 'object' && (o as Obj).activityId != null)
    .filter((o) => isGarminRun(o.activityType as Obj))
    .map((o) => {
      const date = localDate(o)
      if (!date) return null
      const meters = num(o.distance)
      // Temps chronométré (hors pauses), comme la durée COROS ; sinon le temps en mouvement ou écoulé.
      const seconds = num(o.duration) ?? num(o.movingDuration) ?? num(o.elapsedDuration)
      const name = str(o.activityName) ?? 'Run'
      const place = str(o.locationName)
      return {
        labelId: `${GARMIN_PREFIX}${String(o.activityId)}`,
        sportType: garminSportType(str((o.activityType as Obj).typeKey)),
        date,
        // Garmin nomme souvent la sortie d'après la ville (« Paris Running ») : on n'ajoute le lieu que s'il n'y est pas.
        name: place && !name.toLowerCase().includes(place.toLowerCase()) ? `${name} · ${place}` : name,
        place,
        meters: meters && meters > 0 ? meters : null,
        seconds: seconds && seconds > 0 ? seconds : null,
        paceSecPerKm: meters && seconds && meters > 0 ? seconds / (meters / 1000) : null,
        avgHr: num(o.averageHR),
        startMs: startMs(o),
      }
    })
    .filter((a): a is GarminActivity => a !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startMs ?? 0) - (a.startMs ?? 0))
}

/** Le fichier d'origine arrive zippé (application/x-zip-compressed) ; un .FIT nu est accepté aussi. */
export async function fitBytes(file: Uint8Array): Promise<Uint8Array | null> {
  const isZip = file[0] === 0x50 && file[1] === 0x4b
  if (!isZip) return Decoder.isFIT(Stream.fromByteArray(file)) ? file : null
  const reader = new ZipReader(new Uint8ArrayReader(file), { useWebWorkers: false })
  try {
    const entries = await reader.getEntries()
    const fit = entries.find((e) => !e.directory && /\.fit$/i.test(e.filename)) ?? entries.find((e) => !e.directory)
    if (!fit || fit.directory) return null
    return await fit.getData(new Uint8ArrayWriter())
  } finally {
    await reader.close()
  }
}

/** Messages `lap` du FIT (SDK FIT officiel de Garmin) → tours de l'app. */
export function lapsFromFit(fit: Uint8Array): GarminLap[] {
  const decoder = new Decoder(Stream.fromByteArray(fit))
  if (!decoder.isFIT()) return []
  const { messages } = decoder.read({ convertDateTimesToDates: false })
  const laps = (messages.lapMesgs ?? []) as Obj[]
  return laps
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (num(a.l.messageIndex) ?? a.i) - (num(b.l.messageIndex) ?? b.i))
    .map(({ l }, i) => {
      const meters = num(l.totalDistance)
      const seconds = num(l.totalTimerTime) ?? num(l.totalElapsedTime)
      const speed = num(l.enhancedAvgSpeed) ?? num(l.avgSpeed)
      return {
        index: i + 1,
        meters: meters ?? null,
        seconds: seconds ?? null,
        paceSecPerKm: meters && seconds ? seconds / (meters / 1000) : speed ? 1000 / speed : null,
        avgHr: num(l.avgHeartRate),
      }
    })
}

export async function lapsFromActivityFile(file: Uint8Array) {
  const fit = await fitBytes(file)
  return fit ? lapsFromFit(fit) : []
}

/** `exp` (secondes) d'un JWT, sans vérifier la signature, en epoch ms. */
export function jwtExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null
  } catch {
    return null
  }
}

/** Le jeton est renvoyé en texte brut (JWT) ; une enveloppe JSON est tolérée par prudence. */
export function extractToken(body: string): string | null {
  const t = body.trim()
  let v = t
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as Obj
      v = String(j.access_token ?? j.accessToken ?? j.token ?? '')
    } catch {
      return null
    }
  }
  v = v.replace(/^"|"$/g, '')
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(v) ? v : null
}
