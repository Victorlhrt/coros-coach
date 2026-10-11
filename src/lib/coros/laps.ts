import { useQuery } from '@tanstack/react-query'
import { clock, num, parseMeters, parseSeconds, pick, type Obj } from './activities'
import { corosRead } from './client'

export interface Lap {
  index: number
  meters: number | null
  seconds: number | null
  paceSecPerKm: number | null
  avgHr: number | null
}

const LAP_KEY = /distance|time|pace|duration/i

/** Premier tableau d'objets qui ressemble à des tours (distance / temps / allure). */
function findLaps(node: unknown): Obj[] {
  if (Array.isArray(node)) {
    const objs = node.filter((x): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x))
    if (objs.length >= 1 && objs.every((o) => Object.keys(o).filter((k) => LAP_KEY.test(k)).length >= 2)) return objs
    for (const x of node) {
      const r = findLaps(x)
      if (r.length) return r
    }
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) {
      const r = findLaps(v)
      if (r.length) return r
    }
  }
  return []
}

/** Normalise la réponse de queryActivityLapData (format non documenté, lecture tolérante). */
export function normalizeLaps(raw: unknown): Lap[] {
  return findLaps(raw).map((o, i) => {
    const meters = parseMeters(o)
    const seconds = parseSeconds(o)
    return {
      index: i + 1,
      meters,
      seconds,
      paceSecPerKm: clock(pick(o, /pace/i)) ?? (meters && seconds ? seconds / (meters / 1000) : null),
      avgHr: num(pick(o, /(avg|average).?(heart|hr)|^hr$|heart.?rate/i)),
    }
  })
}

export function fetchLaps(labelId: string, sportType: number) {
  return corosRead('queryActivityLapData', { labelId, sportType })
}

/** Splits d'une activité : ils ne changent plus, on les garde en cache. */
export function useLaps(labelId: string | null | undefined, sportType = 100) {
  return useQuery({
    queryKey: ['coros', 'laps', labelId],
    queryFn: async () => {
      const raw = await fetchLaps(labelId!, sportType)
      return { raw, laps: normalizeLaps(raw) }
    },
    enabled: !!labelId,
    staleTime: Infinity,
  })
}
