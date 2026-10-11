import { toIso } from '@/lib/coach/dates'

export interface Activity {
  labelId: string
  sportType: number
  date: string
  name: string
  meters: number | null
  seconds: number | null
  paceSecPerKm: number | null
}

export type Obj = Record<string, unknown>

/** Premier tableau d'objets contenant des labelId, où qu'il soit dans la réponse. */
function findRecords(node: unknown): Obj[] {
  if (Array.isArray(node)) {
    if (node.some((x) => x && typeof x === 'object' && 'labelId' in x)) return node as Obj[]
    for (const x of node) {
      const r = findRecords(x)
      if (r.length) return r
    }
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) {
      const r = findRecords(v)
      if (r.length) return r
    }
  }
  return []
}

export function pick(o: Obj, re: RegExp, exclude?: RegExp) {
  const key = Object.keys(o).find((k) => re.test(k) && !exclude?.test(k))
  return key ? o[key] : undefined
}

export function num(v: unknown) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** "1:02:03" / "45:10" → secondes */
export function clock(v: unknown) {
  if (typeof v !== 'string' || !v.includes(':')) return null
  const parts = v.split(':').map(Number)
  return parts.every(Number.isFinite) ? parts.reduce((a, p) => a * 60 + p, 0) : null
}

function parseDate(o: Obj) {
  const ts = num(pick(o, /^start.*time.*stamp$|^startTime$/i))
  if (ts) return toIso(new Date(ts > 1e12 ? ts : ts * 1000))
  const d = String(pick(o, /date|day/i) ?? '')
  const m = d.match(/(\d{4})-?(\d{2})-?(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function parseMeters(o: Obj) {
  const raw = pick(o, /distance/i)
  const n = num(raw)
  if (n === null) return null
  if (typeof raw === 'string' && /km/i.test(raw)) return n * 1000
  if (typeof raw === 'string' && /\bm\b/i.test(raw)) return n
  // Nombre nu : en km s'il est petit, sinon en mètres.
  return n < 300 ? n * 1000 : n
}

export function parseSeconds(o: Obj) {
  const raw = pick(o, /workout.?time|duration|total.?time|^time$/i, /stamp/i)
  return clock(raw) ?? num(raw)
}

/** Normalise la réponse de querySportRecords (format non documenté, lecture tolérante). */
export function normalizeActivities(raw: unknown): Activity[] {
  return findRecords(raw)
    .map((o) => {
      const date = parseDate(o)
      if (!date) return null
      const meters = parseMeters(o)
      const seconds = parseSeconds(o)
      const pace = clock(pick(o, /pace/i)) ?? (meters && seconds ? seconds / (meters / 1000) : null)
      return {
        labelId: String(o.labelId),
        sportType: Number(o.sportType ?? 100),
        date,
        name: String(pick(o, /name|title|sport.?name/i) ?? 'Course'),
        meters,
        seconds,
        paceSecPerKm: pace,
      }
    })
    .filter((a): a is Activity => a !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
}
