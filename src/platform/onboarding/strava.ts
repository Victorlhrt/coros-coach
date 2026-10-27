import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js'
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

/** Dates de l'export : « Jan 5, 2024, 7:12:34 AM » (anglais) ou « 5 janv. 2024, 07:12:34 » (français). */
function parseDate(s: string): Date | null {
  const en = s.match(/^([A-Za-z]{3})\w* (\d{1,2}), (\d{4})/)
  if (en && MONTHS[en[1].toLowerCase()] !== undefined) return new Date(Number(en[3]), MONTHS[en[1].toLowerCase()], Number(en[2]))
  const fr = s.match(/^(\d{1,2}) ([a-zéû]+)\.? (\d{4})/i)
  if (fr && MONTHS[fr[2].toLowerCase()] !== undefined) return new Date(Number(fr[3]), MONTHS[fr[2].toLowerCase()], Number(fr[1]))
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t)
}

const num = (s: string | undefined) => {
  const n = Number((s ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const TARGETS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Semi' },
  { km: 42.195, label: 'Marathon' },
]

export async function readStravaExport(file: File, onProgress?: (percent: number) => void): Promise<StravaSummary> {
  const zip = new ZipReader(new BlobReader(file))
  try {
    const entries = await zip.getEntries()
    const csv = entries.find((e) => !e.directory && /(^|\/)activities\.csv$/i.test(e.filename))
    if (!csv || csv.directory) throw new Error('Pas de fichier activities.csv : est-ce bien l’export de ton compte Strava ?')
    const text = await csv.getData(new TextWriter(), { onprogress: async (done, total) => onProgress?.(Math.round((done / total) * 90)) })
    return summarize(parseCsv(text))
  } finally {
    await zip.close()
  }
}

function summarize(rows: string[][]): StravaSummary {
  const [head, ...data] = rows
  if (!head) throw new Error('Le fichier activities.csv est vide.')
  const col = (name: string, nth = 0) => head.map((h, i) => [h.trim(), i] as const).filter(([h]) => h === name)[nth]?.[1] ?? -1
  const iDate = col('Activity Date')
  const iType = col('Activity Type')
  const iElapsed = col('Elapsed Time')
  const iKm = col('Distance')
  const iMeters = col('Distance', 1)
  const iElev = col('Elevation Gain')
  if (iDate < 0 || iType < 0 || iKm < 0) throw new Error('Format de activities.csv non reconnu.')

  const runs = data
    .filter((r) => r.length > iType && /run|course/i.test(r[iType]))
    .map((r) => {
      const meters = iMeters >= 0 ? num(r[iMeters]) : 0
      return {
        date: parseDate(r[iDate]),
        km: meters > 0 ? meters / 1000 : num(r[iKm]),
        seconds: iElapsed >= 0 ? num(r[iElapsed]) : 0,
        elevation: iElev >= 0 ? num(r[iElev]) : 0,
      }
    })
    .filter((r): r is typeof r & { date: Date } => !!r.date && r.km > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const now = Date.now()
  const recent = runs.filter((r) => now - r.date.getTime() < 84 * 86400_000)
  const recentKm = recent.reduce((t, r) => t + r.km, 0)

  // Meilleur temps de l'année sur chaque distance classique (sortie à ±4 % de la distance, peu de dénivelé).
  const year = runs.filter((r) => now - r.date.getTime() < 365 * 86400_000 && r.seconds > 0)
  const performances: Performance[] = TARGETS.flatMap((t) => {
    const best = year.filter((r) => Math.abs(r.km / t.km - 1) <= 0.04 && r.elevation < t.km * 15).sort((a, b) => a.seconds / a.km - b.seconds / b.km)[0]
    return best
      ? [{ label: `${t.label} Strava`, km: best.km, elevation: best.elevation, seconds: best.seconds, date: best.date.toISOString().slice(0, 10), source: 'strava' as const }]
      : []
  })

  return {
    runs: runs.length,
    since: runs[0]?.date.toISOString().slice(0, 10) ?? null,
    recent: {
      runs: recent.length,
      km: Math.round(recentKm),
      weeklyKm: Math.round(recentKm / 12),
      longestKm: Math.round(Math.max(0, ...recent.map((r) => r.km)) * 10) / 10,
    },
    performances,
  }
}
