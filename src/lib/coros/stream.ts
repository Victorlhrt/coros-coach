import { useQuery } from '@tanstack/react-query'
import { GARMIN_PREFIX, isGarminId } from '@/lib/garmin/merge'
import { api } from '@/platform/api'
import { corosRead } from './client'

/** Même forme que `ActivityStream` côté serveur (server/src/platform/garmin-normalize.ts). */
export interface ActivityStream {
  /** Secondes de temps chronométré entre deux points. */
  step: number
  hr: (number | null)[]
  /** m/s */
  speed: (number | null)[]
  /** Temps chronométré (s) où reprend chaque pause. */
  pauses: number[]
}

const CACHE_PREFIX = 'stream:'
const CACHE_MAX = 40

/** Une activité ne change plus : ses courbes sont gardées dans le navigateur (COROS limite à 50 fichiers par jour). */
function readCache(labelId: string): ActivityStream | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + labelId)
    return raw ? (JSON.parse(raw) as { v: ActivityStream | null }).v : undefined
  } catch {
    return undefined
  }
}

function writeCache(labelId: string, v: ActivityStream | null) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX))
    // Au-delà de CACHE_MAX activités, on oublie les plus anciennes écrites.
    if (keys.length >= CACHE_MAX) {
      const aged = keys.map((k) => ({ k, at: (JSON.parse(localStorage.getItem(k) ?? '{}') as { at?: number }).at ?? 0 })).sort((a, b) => a.at - b.at)
      aged.slice(0, keys.length - CACHE_MAX + 1).forEach(({ k }) => localStorage.removeItem(k))
    }
    localStorage.setItem(CACHE_PREFIX + labelId, JSON.stringify({ at: Date.now(), v }))
  } catch {
    // Stockage plein ou indisponible : on relira la prochaine fois.
  }
}

/** Premier lien https trouvé dans la réponse (format non documenté, lecture tolérante). */
export function findUrl(node: unknown): string | null {
  if (typeof node === 'string') return node.match(/https:\/\/[^\s"'<>\\]+/)?.[0] ?? null
  if (Array.isArray(node)) {
    for (const x of node) {
      const u = findUrl(x)
      if (u) return u
    }
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) {
      const u = findUrl(v)
      if (u) return u
    }
  }
  return null
}

async function fetchStream(labelId: string, sportType: number): Promise<ActivityStream | null> {
  if (isGarminId(labelId)) return api<ActivityStream | null>(`/account/garmin/activities/${encodeURIComponent(labelId.replace(GARMIN_PREFIX, ''))}/stream`)
  const raw = await corosRead('queryActivityFitFileDownloadUrls', { labelId, sportType })
  const url = findUrl(raw)
  if (!url) throw new Error('COROS didn’t return the activity file.')
  return api<ActivityStream | null>('/account/streams/coros', { body: { url, labelId } })
}

/** FC et vitesse au fil de la sortie, lues dans le fichier FIT (null : fichier sans courbes). */
export function useActivityStream(labelId: string | null | undefined, sportType = 100) {
  return useQuery({
    queryKey: ['activity', 'stream', labelId],
    queryFn: async () => {
      const hit = readCache(labelId!)
      if (hit !== undefined) return hit
      const stream = await fetchStream(labelId!, sportType)
      writeCache(labelId!, stream)
      return stream
    },
    // Archive Strava : seul activities.csv est lu, pas de fichiers.
    enabled: !!labelId && !labelId.startsWith('strava:'),
    staleTime: Infinity,
    retry: 1,
  })
}

/** Moyenne glissante centrée sur `window` secondes (lisse le bruit GPS de la vitesse). */
export function smooth(values: (number | null)[], step: number, window: number) {
  const half = Math.max(0, Math.round(window / step / 2))
  return values.map((_, i) => {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j]
      if (v !== null) {
        sum += v
        n++
      }
    }
    return n ? sum / n : null
  })
}
