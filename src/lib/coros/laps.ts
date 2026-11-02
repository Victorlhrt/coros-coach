import { useQuery } from '@tanstack/react-query'
import { clock, num, parseMeters, parseSeconds, pick, type Obj } from './activities'
import { corosRead } from './client'
import { fetchGarminLaps } from '@/lib/garmin/client'
import { isGarminId } from '@/lib/garmin/merge'

export interface Lap {
  index: number
  meters: number | null
  seconds: number | null
  paceSecPerKm: number | null
  avgHr: number | null
}

const LAP_KEY = /distance|time|pace|duration/i

/** Tous les tableaux d'objets qui ressemblent à des tours (distance / temps / allure). */
function findLapSets(node: unknown, out: Obj[][] = []): Obj[][] {
  if (Array.isArray(node)) {
    const objs = node.filter((x): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x))
    if (objs.length >= 1 && objs.every((o) => Object.keys(o).filter((k) => LAP_KEY.test(k)).length >= 2)) out.push(objs)
    else node.forEach((x) => findLapSets(x, out))
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach((v) => findLapSets(v, out))
  }
  return out
}

/**
 * Tours découpés à distance fixe (1 km auto) : tous identiques sauf le dernier. Ils lissent un fractionné
 * (un 400 m rapide et sa récup tombent dans le même kilomètre) : on préfère les tours de la séance ou manuels.
 */
function isAutoSplit(objs: Obj[]) {
  const meters = objs.map(parseMeters).slice(0, -1).filter((m): m is number => m !== null && m > 0)
  if (meters.length < 2) return false
  const mean = meters.reduce((a, m) => a + m, 0) / meters.length
  return meters.every((m) => Math.abs(m - mean) <= mean * 0.03)
}

/** Le jeu de tours le plus parlant : d'abord ceux qui ne sont pas des splits fixes, puis le plus détaillé. */
function findLaps(node: unknown): Obj[] {
  const sets = findLapSets(node)
  return sets.sort((a, b) => Number(isAutoSplit(a)) - Number(isAutoSplit(b)) || b.length - a.length)[0] ?? []
}

/**
 * Normalise la réponse de queryActivityLapData (format non documenté, lecture tolérante).
 * COROS donne la distance des tours en centimètres : avec `totalMeters` (distance de l'activité),
 * l'échelle est recalée à la puissance de 10 qui fait coïncider la somme des tours avec le total.
 */
export function normalizeLaps(raw: unknown, totalMeters?: number | null): Lap[] {
  const objs = findLaps(raw)
  const rawMeters = objs.map(parseMeters)
  const sum = rawMeters.reduce<number>((a, m) => a + (m ?? 0), 0)
  const scale = totalMeters && sum > 0 ? 10 ** Math.round(Math.log10(totalMeters / sum)) : 1
  return objs.map((o, i) => {
    const meters = rawMeters[i] === null ? null : rawMeters[i]! * scale
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

/** Splits d'une activité : ils ne changent plus, on les garde en cache. Les activités Garmin passent par le serveur. */
export function useLaps(labelId: string | null | undefined, sportType = 100, totalMeters?: number | null) {
  return useQuery({
    queryKey: ['coros', 'laps', labelId, totalMeters],
    queryFn: async () => {
      // Sorties importées de l'archive Strava : pas de splits (seul activities.csv est lu).
      if (labelId?.startsWith('strava:')) return { raw: null as unknown, laps: [] as Lap[] }
      if (isGarminId(labelId)) {
        const laps = await fetchGarminLaps(labelId!)
        return { raw: laps as unknown, laps }
      }
      const raw = await fetchLaps(labelId!, sportType)
      return { raw, laps: normalizeLaps(raw, totalMeters) }
    },
    enabled: !!labelId,
    staleTime: Infinity,
  })
}
