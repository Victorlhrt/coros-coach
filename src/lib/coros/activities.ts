import { toIso } from '@/lib/coach/dates'

export interface Activity {
  labelId: string
  sportType: number
  date: string
  name: string
  meters: number | null
  seconds: number | null
  paceSecPerKm: number | null
  /** Fréquence cardiaque moyenne (bpm), quand COROS la donne. */
  avgHr: number | null
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

/**
 * Réponse texte du serveur COROS : une fiche numérotée par activité.
 *   1. Outdoor Run — 2026-10-11
 *      Time Window: startTimestamp=1791698430 | endTimestamp=1791704330
 *      Duration: 1:33:45 | Distance: 21.11 km
 *      Average Pace: 4:27 /km | Avg HR: 171 bpm | Calories: 1743 kcal
 *      LabelId: 480957002474881327 | SportType: 100
 * Chaque fiche devient un objet aux mêmes clés que le JSON, pour réutiliser la lecture tolérante.
 */
function parseTextRecords(text: string): Obj[] {
  return text
    .split(/^\s*\d+\.\s+/m)
    .slice(1)
    .map((block) => {
      const [head, ...lines] = block.split('\n')
      const header = head.match(/^(.*?)\s+[—–-]\s+(\d{4}-\d{2}-\d{2})\s*$/)
      const o: Obj = header ? { name: header[1].trim(), date: header[2] } : { name: head.trim() }
      for (const part of lines.flatMap((l) => l.split('|'))) {
        const eq = part.match(/(\w+)=(\S+)/)
        if (eq) {
          o[eq[1]] = eq[2]
          continue
        }
        const kv = part.match(/^\s*([^:]+?):\s*(.+?)\s*$/)
        if (!kv) continue
        const key = kv[1].replace(/\s+(\w)/g, (_, c: string) => c.toUpperCase())
        o[key.charAt(0).toLowerCase() + key.slice(1)] = kv[2]
      }
      // L'allure arrive en « 4:27 /km » : on ne garde que l'horloge.
      if (typeof o.averagePace === 'string') o.averagePace = o.averagePace.split(/\s/)[0]
      return o
    })
    .filter((o) => o.labelId)
}

/** Normalise la réponse de querySportRecords : texte du serveur COROS, ou JSON (lecture tolérante). */
export function normalizeActivities(raw: unknown): Activity[] {
  return (typeof raw === 'string' ? parseTextRecords(raw) : findRecords(raw))
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
        name: String(pick(o, /name|title|sport.?name/i) ?? 'Run'),
        meters,
        seconds,
        paceSecPerKm: pace,
        avgHr: num(pick(o, /^(avg|average).?(heart.?rate|hr)$/i)),
      }
    })
    .filter((a): a is Activity => a !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
}
