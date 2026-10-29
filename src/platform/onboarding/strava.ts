import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js'
import type { Activity } from '@/lib/coros/activities'
import type { Performance } from './estimate'

/**
 * Lecture de l'export Strava (« Télécharger votre compte »), entièrement dans le navigateur : seul
 * `activities.csv` est extrait du ZIP (lecture par accès direct, l'archive n'est jamais chargée en entier
 * ni envoyée), puis résumé en quelques chiffres utiles au plan.
 */

export type StravaSummary = {
  runs: number
  since: string | null
  recent: { runs: number; km: number; weeklyKm: number; longestKm: number }
  performances: Performance[]
}

/** Analyse CSV (RFC 4180) : champs entre guillemets, virgules et retours à la ligne dans les champs. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}

const MONTHS: Record<string, number> = {
  jan: 0, janv: 0, feb: 1, fév: 1, fevr: 1, févr: 1, mar: 2, mars: 2, apr: 3, avr: 3, may: 4, mai: 4, jun: 5, juin: 5,
  jul: 6, juil: 6, aug: 7, août: 7, aout: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11, déc: 11,
}

/**
 * Dates de l'export : « Jan 5, 2024, 7:12:34 AM » (anglais) ou « 5 janv. 2024, 07:12:34 » (français), en UTC
 * dans `activities.csv` : on rend l'instant de départ, le jour local s'en déduit dans le fuseau du navigateur.
 */
function parseDate(s: string): Date | null {
  let y: number, mo: number, d: number
  const en = s.match(/^([A-Za-z]{3})\w* (\d{1,2}), (\d{4})/)
  const fr = s.match(/^(\d{1,2}) ([a-zéû]+)\.? (\d{4})/i)
  if (en && MONTHS[en[1].toLowerCase()] !== undefined) [y, mo, d] = [Number(en[3]), MONTHS[en[1].toLowerCase()], Number(en[2])]
  else if (fr && MONTHS[fr[2].toLowerCase()] !== undefined) [y, mo, d] = [Number(fr[3]), MONTHS[fr[2].toLowerCase()], Number(fr[1])]
  else {
    const t = Date.parse(s)
    return Number.isNaN(t) ? null : new Date(t)
  }
  const tm = s.slice((en ?? fr)![0].length).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]\.?M\.?)?/i)
  let h = tm ? Number(tm[1]) : 12
  if (tm?.[4]) h = (h % 12) + (/^p/i.test(tm[4]) ? 12 : 0)
  return new Date(Date.UTC(y, mo, d, h, tm ? Number(tm[2]) : 0, tm?.[3] ? Number(tm[3]) : 0))
}

const num = (s: string | undefined) => {
  const n = Number((s ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Jour local (navigateur) d'un instant, au format AAAA-MM-JJ. */
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Course à pied, trail et course virtuelle (types anglais et français) ; le reste (vélo, marche, natation…) est ignoré. */
const isRun = (type: string) => /\brun\b|course|trail/i.test(type) && !/v[ée]lo|ride|bike/i.test(type)

/** Une sortie course lue dans `activities.csv`. */
export type StravaRun = {
  /** Identifiant de l'activité Strava. */
  id: string
  /** Jour local du départ (AAAA-MM-JJ). */
  date: string
  /** Départ (ms depuis l'epoch), pour le dédoublonnage avec la montre. */
  startMs: number
  name: string
  trail: boolean
  meters: number
  /** Temps en mouvement (s), à défaut le temps écoulé. */
  movingSeconds: number
  elapsedSeconds: number
  avgHr: number | null
  elevation: number
}

/** Intitulés des colonnes, en anglais et en français (accents et apostrophes neutralisés). */
const COLUMNS = {
  id: ['activity id', "id de l'activite"],
  date: ['activity date', "date de l'activite"],
  name: ['activity name', "nom de l'activite"],
  type: ['activity type', "type d'activite"],
  elapsed: ['elapsed time', 'temps ecoule'],
  moving: ['moving time', 'temps de deplacement'],
  distance: ['distance'],
  elevation: ['elevation gain', 'denivele positif'],
  avgHr: ['average heart rate', 'frequence cardiaque moyenne'],
} as const

const normHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*\.$/, '')

/** Toutes les sorties course de `activities.csv` (texte du fichier), triées du plus ancien au plus récent. */
export function parseStravaRuns(text: string): StravaRun[] {
  const [head, ...data] = parseCsv(text.replace(/^﻿/, ''))
  if (!head) throw new Error('The activities.csv file is empty.')
  const names = head.map(normHeader)
  // Certaines colonnes reviennent deux fois : « Distance » en km (ou miles) puis en mètres, « Elapsed Time » en secondes puis en décimal.
  const col = (key: keyof typeof COLUMNS, nth = 0) => names.map((h, i) => [h, i] as const).filter(([h]) => (COLUMNS[key] as readonly string[]).includes(h))[nth]?.[1] ?? -1
  const iId = col('id')
  const iDate = col('date')
  const iName = col('name')
  const iType = col('type')
  const iElapsed = col('elapsed')
  const iMoving = col('moving')
  const iKm = col('distance')
  const iMeters = col('distance', 1)
  const iElev = col('elevation')
  const iHr = col('avgHr')
  if (iDate < 0 || iType < 0 || iKm < 0) throw new Error('Unrecognised activities.csv format.')

  return data
    .filter((r) => r.length > iType && isRun(r[iType]))
    .flatMap((r, n): StravaRun[] => {
      const start = parseDate(r[iDate] ?? '')
      const meters = iMeters >= 0 && num(r[iMeters]) > 0 ? num(r[iMeters]) : num(r[iKm]) * 1000
      if (!start || !(meters > 0)) return []
      const elapsed = iElapsed >= 0 ? num(r[iElapsed]) : 0
      const moving = iMoving >= 0 ? num(r[iMoving]) : 0
      const hr = iHr >= 0 ? num(r[iHr]) : 0
      return [
        {
          id: (iId >= 0 && r[iId]?.trim()) || `${start.getTime()}-${n}`,
          date: localDay(start),
          startMs: start.getTime(),
          name: (iName >= 0 && r[iName]?.trim()) || r[iType],
          trail: /trail/i.test(r[iType]),
          meters: Math.round(meters),
          movingSeconds: Math.round(moving > 0 ? moving : elapsed),
          elapsedSeconds: Math.round(elapsed > 0 ? elapsed : moving),
          avgHr: hr > 0 ? Math.round(hr) : null,
          elevation: iElev >= 0 ? Math.round(num(r[iElev])) : 0,
        },
      ]
    })
    .sort((a, b) => a.startMs - b.startMs)
}

export const STRAVA_PREFIX = 'strava:'
export const isStravaId = (labelId: string | null | undefined) => !!labelId?.startsWith(STRAVA_PREFIX)

/** Sortie Strava dans la forme des activités montre (sportType 100 = course, comme COROS ; le trail aussi). */
export function stravaRunToActivity(r: StravaRun): Activity & { startMs: number } {
  return {
    labelId: `${STRAVA_PREFIX}${r.id}`,
    sportType: 100,
    date: r.date,
    name: r.name,
    place: null,
    meters: r.meters,
    seconds: r.movingSeconds || null,
    paceSecPerKm: r.movingSeconds && r.meters ? Math.round(r.movingSeconds / (r.meters / 1000)) : null,
    avgHr: r.avgHr,
    startMs: r.startMs,
  }
}

async function readActivitiesCsv(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const zip = new ZipReader(new BlobReader(file))
  try {
    const entries = await zip.getEntries()
    const csv = entries.find((e) => !e.directory && /(^|\/)activities\.csv$/i.test(e.filename))
    if (!csv || csv.directory) throw new Error('No activities.csv file found: is this really your Strava account export?')
    return await csv.getData(new TextWriter(), { onprogress: async (done, total) => onProgress?.(Math.round((done / total) * 90)) })
  } finally {
    await zip.close()
  }
}

/** Résumé pour l'onboarding (volume récent, meilleures performances de l'année). */
export async function readStravaExport(file: File, onProgress?: (percent: number) => void): Promise<StravaSummary> {
  return summarizeStravaRuns(parseStravaRuns(await readActivitiesCsv(file, onProgress)))
}

/** Résumé et liste des sorties, pour l'import depuis les réglages. */
export async function readStravaArchive(file: File, onProgress?: (percent: number) => void): Promise<{ summary: StravaSummary; runs: StravaRun[] }> {
  const runs = parseStravaRuns(await readActivitiesCsv(file, onProgress))
  return { summary: summarizeStravaRuns(runs), runs }
}

const TARGETS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Half marathon' },
  { km: 42.195, label: 'Marathon' },
]

export function summarizeStravaRuns(all: StravaRun[], now = Date.now()): StravaSummary {
  const runs = all.map((r) => ({ date: r.date, t: r.startMs, km: r.meters / 1000, seconds: r.elapsedSeconds, elevation: r.elevation }))
  const recent = runs.filter((r) => now - r.t < 84 * 86400_000)
  const recentKm = recent.reduce((t, r) => t + r.km, 0)

  // Meilleur temps de l'année sur chaque distance classique (sortie à ±4 % de la distance, peu de dénivelé).
  const year = runs.filter((r) => now - r.t < 365 * 86400_000 && r.seconds > 0)
  const performances: Performance[] = TARGETS.flatMap((t) => {
    const best = year.filter((r) => Math.abs(r.km / t.km - 1) <= 0.04 && r.elevation < t.km * 15).sort((a, b) => a.seconds / a.km - b.seconds / b.km)[0]
    return best ? [{ label: `${t.label} Strava`, km: best.km, elevation: best.elevation, seconds: best.seconds, date: best.date, source: 'strava' as const }] : []
  })

  return {
    runs: runs.length,
    since: runs[0]?.date ?? null,
    recent: {
      runs: recent.length,
      km: Math.round(recentKm),
      weeklyKm: Math.round(recentKm / 12),
      longestKm: Math.round(Math.max(0, ...recent.map((r) => r.km)) * 10) / 10,
    },
    performances,
  }
}
