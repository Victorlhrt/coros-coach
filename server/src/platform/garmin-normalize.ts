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
  /** Cadence moyenne (pas par minute). */
  avgCadence: number | null
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
        avgCadence: spm(num(o.averageRunningCadenceInStepsPerMinute)),
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

/** Courbes d'une activité, rééchantillonnées toutes les `step` secondes de temps chronométré (pauses retirées). */
export interface ActivityStream {
  step: number
  /** FC moyenne (bpm) de chaque pas, null sans capteur. */
  hr: (number | null)[]
  /** Vitesse moyenne (m/s) de chaque pas, null sans mesure. */
  speed: (number | null)[]
  /** Temps chronométré (s) où reprend chaque pause, pour la marquer sur le graphique. */
  pauses: number[]
  /** Cadence moyenne de la sortie (pas par minute), null sans capteur. */
  cadence?: number | null
}

/** Cadence plausible en course (pas/min), arrondie ; sinon null. */
function spm(v: number | null) {
  return v !== null && v >= 100 && v <= 260 ? Math.round(v) : null
}

/**
 * Cadence moyenne d'un FIT en pas par minute. Le FIT compte les cycles d'une jambe (×2 pour des pas) : moyenne du
 * message `session`, sinon moyenne des enregistrements en mouvement (vitesse ≥ 1 m/s).
 */
function fitCadence(messages: { sessionMesgs?: unknown }, records: Obj[]) {
  const session = ((messages.sessionMesgs ?? []) as Obj[])[0]
  const avg = session ? (num(session.avgRunningCadence) ?? num(session.avgCadence)) : null
  if (avg) return spm((avg + (num(session!.avgFractionalCadence) ?? 0)) * 2)
  const moving = records
    .filter((r) => (num(r.enhancedSpeed) ?? num(r.speed) ?? 0) >= 1)
    .map((r) => num(r.cadence))
    .filter((c): c is number => c !== null && c > 0)
  return moving.length ? spm((moving.reduce((a, b) => a + b, 0) / moving.length) * 2) : null
}

const STREAM_MAX_POINTS = 1500
/** Sans événement de pause, un trou plus long que ça entre deux enregistrements est une pause. */
const GAP_S = 15

/**
 * Messages `record` du FIT (FC et vitesse, en général chaque seconde) → courbes à pas fixe sur le temps chronométré.
 * Les pauses viennent des événements `timer` (stop / start) ; à défaut, d'un trou de plus de 15 s.
 * La vitesse d'un pas est la distance parcourue divisée par sa durée quand la distance est enregistrée (plus stable que
 * la vitesse instantanée), sinon la moyenne des vitesses instantanées.
 */
export function streamFromFit(fit: Uint8Array): ActivityStream | null {
  const decoder = new Decoder(Stream.fromByteArray(fit))
  if (!decoder.isFIT()) return null
  const { messages } = decoder.read({ convertDateTimesToDates: false })
  const records = ((messages.recordMesgs ?? []) as Obj[])
    .map((r) => ({
      ts: num(r.timestamp),
      hr: num(r.heartRate),
      speed: num(r.enhancedSpeed) ?? num(r.speed),
      dist: num(r.distance),
    }))
    .filter((r): r is { ts: number; hr: number | null; speed: number | null; dist: number | null } => r.ts !== null)
    .sort((a, b) => a.ts - b.ts)
  if (records.length < 2) return null

  // Pauses du chronomètre : [début, fin] en horodatage FIT.
  const events = ((messages.eventMesgs ?? []) as Obj[])
    .filter((e) => e.event === 'timer' && num(e.timestamp) !== null)
    .map((e) => ({ ts: num(e.timestamp)!, stop: e.eventType === 'stop' || e.eventType === 'stopAll' || e.eventType === 'stopDisableAll' }))
    .sort((a, b) => a.ts - b.ts)
  const paused: [number, number][] = []
  let stopAt: number | null = null
  for (const e of events) {
    if (e.stop && stopAt === null) stopAt = e.ts
    else if (!e.stop && stopAt !== null) {
      if (e.ts > stopAt) paused.push([stopAt, e.ts])
      stopAt = null
    }
  }

  // Temps chronométré de chaque enregistrement.
  const timer: number[] = []
  const pauses: number[] = []
  let t = 0
  for (let i = 0; i < records.length; i++) {
    if (i > 0) {
      const a = records[i - 1].ts
      const b = records[i].ts
      const inPause = paused.reduce((acc, [s, e]) => acc + Math.max(0, Math.min(b, e) - Math.max(a, s)), 0)
      let dt = b - a - inPause
      if (inPause > 0 || (!paused.length && dt > GAP_S)) {
        if (!paused.length) dt = 1
        pauses.push(t + dt)
      }
      t += Math.max(0, dt)
    }
    timer.push(t)
  }
  const total = t
  if (total <= 0) return null
  const step = Math.max(1, Math.ceil(total / STREAM_MAX_POINTS))
  const n = Math.floor(total / step) + 1

  const hrSum = new Array<number>(n).fill(0)
  const hrN = new Array<number>(n).fill(0)
  const spSum = new Array<number>(n).fill(0)
  const spN = new Array<number>(n).fill(0)
  const distFirst = new Array<number | null>(n).fill(null)
  const distLast = new Array<number | null>(n).fill(null)
  const timeFirst = new Array<number>(n).fill(0)
  const timeLast = new Array<number>(n).fill(0)
  records.forEach((r, i) => {
    const k = Math.min(n - 1, Math.floor(timer[i] / step))
    if (r.hr !== null && r.hr > 0) (hrSum[k] += r.hr), hrN[k]++
    if (r.speed !== null && r.speed >= 0) (spSum[k] += r.speed), spN[k]++
    if (r.dist !== null) {
      if (distFirst[k] === null) (distFirst[k] = r.dist), (timeFirst[k] = timer[i])
      ;(distLast[k] = r.dist), (timeLast[k] = timer[i])
    }
  })
  // Distance d'un pas = de son dernier enregistrement à celui du pas précédent (pas de trou entre deux pas).
  let prevDist: number | null = null
  let prevTime = 0
  const speed = Array.from({ length: n }, (_, k) => {
    let v: number | null = spN[k] ? spSum[k] / spN[k] : null
    if (distLast[k] !== null) {
      const d0 = prevDist ?? distFirst[k]!
      const t0 = prevDist !== null ? prevTime : timeFirst[k]
      const dt = timeLast[k] - t0
      if (dt > 0 && distLast[k]! >= d0) v = (distLast[k]! - d0) / dt
      prevDist = distLast[k]
      prevTime = timeLast[k]
    }
    return v === null ? null : Math.round(v * 100) / 100
  })
  const hr = hrSum.map((s, k) => (hrN[k] ? Math.round(s / hrN[k]) : null))
  if (!hr.some((v) => v !== null) && !speed.some((v) => v !== null)) return null
  return { step, hr, speed, pauses: pauses.map((p) => Math.round(p)), cadence: fitCadence(messages, (messages.recordMesgs ?? []) as Obj[]) }
}

export async function streamFromActivityFile(file: Uint8Array) {
  const fit = await fitBytes(file)
  return fit ? streamFromFit(fit) : null
}
