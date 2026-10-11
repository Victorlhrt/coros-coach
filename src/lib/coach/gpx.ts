/** Lecture et analyse d'un GPX de course, entièrement dans le navigateur. */

export interface Climb {
  kind: 'climb' | 'descent'
  startKm: number
  endKm: number
  /** Dénivelé du segment en mètres (toujours positif) */
  elevation: number
  /** Pente moyenne en % (positive pour une montée, négative pour une descente) */
  grade: number
}

export interface CourseProfile {
  name: string
  distanceKm: number
  gain: number
  loss: number
  minEle: number
  maxEle: number
  /** [km, altitude] échantillonnés (≈ 200 points) pour le graphique */
  profile: [number, number][]
  segments: Climb[]
}

export interface Point {
  lat: number
  lon: number
  ele: number | null
}

function haversine(a: Point, b: Point) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function readPoints(xml: string): { name: string; points: Point[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Fichier GPX illisible.')
  let nodes = Array.from(doc.getElementsByTagName('trkpt'))
  if (nodes.length === 0) nodes = Array.from(doc.getElementsByTagName('rtept'))
  if (nodes.length < 2) throw new Error('Aucun tracé trouvé dans le GPX.')
  const points = nodes.map((n) => {
    const ele = n.getElementsByTagName('ele')[0]?.textContent
    return { lat: Number(n.getAttribute('lat')), lon: Number(n.getAttribute('lon')), ele: ele ? Number(ele) : null }
  })
  const name = doc.getElementsByTagName('name')[0]?.textContent?.trim() || 'Parcours'
  return { name, points }
}

/** Lissage sur ~100 m pour éviter de compter le bruit GPS dans le dénivelé. */
function smooth(dist: number[], ele: number[], window = 100) {
  const out: number[] = []
  let lo = 0
  let hi = 0
  let sum = 0
  for (let i = 0; i < ele.length; i++) {
    while (hi < ele.length && dist[hi] - dist[i] <= window / 2) sum += ele[hi++]
    while (dist[i] - dist[lo] > window / 2) sum -= ele[lo++]
    out.push(sum / (hi - lo))
  }
  return out
}

/** Montées et descentes marquées (≥ 40 m), en tolérant de petits replats. */
function findSegments(dist: number[], ele: number[]): Climb[] {
  const MIN = 40
  const TOLERANCE = 15
  const segments: Climb[] = []
  let startIdx = 0
  let extremeIdx = 0
  let dir: 1 | -1 | 0 = 0
  let minIdx = 0
  let maxIdx = 0

  const close = (rawFrom: number, to: number) => {
    // On rogne les replats aux deux bouts : le segment commence et finit là où la pente démarre vraiment.
    let from = rawFrom
    while (from < to && Math.abs(ele[from + 1] - ele[rawFrom]) < 5) from++
    let end = to
    while (end > from && Math.abs(ele[to] - ele[end - 1]) < 5) end--
    to = end
    const elevation = Math.abs(ele[to] - ele[from])
    const length = dist[to] - dist[from]
    if (elevation >= MIN && length > 0) {
      segments.push({
        kind: ele[to] > ele[from] ? 'climb' : 'descent',
        startKm: Math.round(dist[from] / 100) / 10,
        endKm: Math.round(dist[to] / 100) / 10,
        elevation: Math.round(elevation),
        grade: Math.round(((ele[to] - ele[from]) / length) * 1000) / 10,
      })
    }
  }

  for (let i = 1; i < ele.length; i++) {
    if (dir === 0) {
      // Avant la première tendance, on part du point le plus bas (ou haut) rencontré.
      if (ele[i] < ele[minIdx]) minIdx = i
      if (ele[i] > ele[maxIdx]) maxIdx = i
      if (ele[i] - ele[minIdx] >= TOLERANCE) {
        dir = 1
        startIdx = minIdx
        extremeIdx = i
      } else if (ele[maxIdx] - ele[i] >= TOLERANCE) {
        dir = -1
        startIdx = maxIdx
        extremeIdx = i
      }
      continue
    }
    if ((ele[i] - ele[extremeIdx]) * dir > 0) extremeIdx = i
    else if ((ele[extremeIdx] - ele[i]) * dir >= TOLERANCE) {
      close(startIdx, extremeIdx)
      startIdx = extremeIdx
      dir = dir === 1 ? -1 : 1
      extremeIdx = i
    }
  }
  if (dir !== 0) close(startIdx, extremeIdx)
  return segments
}

export function analyzeGpx(xml: string): CourseProfile {
  const { name, points } = readPoints(xml)
  return analyzePoints(name, points)
}

export function analyzePoints(name: string, points: Point[]): CourseProfile {
  const dist = [0]
  for (let i = 1; i < points.length; i++) dist.push(dist[i - 1] + haversine(points[i - 1], points[i]))
  const total = dist[dist.length - 1]
  if (total < 500) throw new Error('Tracé trop court pour une course.')

  const hasEle = points.filter((p) => p.ele !== null).length > points.length / 2
  const rawEle = points.map((p, i) => p.ele ?? points[i - 1]?.ele ?? 0)
  const ele = hasEle ? smooth(dist, rawEle) : rawEle.map(() => 0)

  // Dénivelé avec hystérésis de 4 m : les oscillations du GPS ne comptent pas.
  let gain = 0
  let loss = 0
  let anchor = ele[0]
  for (const e of ele) {
    if (e - anchor >= 4) {
      gain += e - anchor
      anchor = e
    } else if (anchor - e >= 4) {
      loss += anchor - e
      anchor = e
    }
  }

  const step = Math.max(1, Math.floor(points.length / 200))
  const profile: [number, number][] = []
  for (let i = 0; i < points.length; i += step) profile.push([Math.round(dist[i]) / 1000, Math.round(ele[i])])
  profile.push([Math.round(total) / 1000, Math.round(ele[ele.length - 1])])

  return {
    name,
    distanceKm: Math.round(total / 100) / 10,
    gain: Math.round(gain),
    loss: Math.round(loss),
    minEle: Math.round(Math.min(...ele)),
    maxEle: Math.round(Math.max(...ele)),
    profile,
    segments: hasEle ? findSegments(dist, ele) : [],
  }
}
