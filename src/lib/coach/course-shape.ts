import type { CourseProfile } from './gpx'

/**
 * Forme d'un parcours de trail : où se concentre le dénivelé, la plus grosse montée, la part courable.
 * Elle oriente le plan (un départ en montée se prépare par des côtes longues à froid, une fin en descente par de
 * l'excentrique sur fatigue) et la stratégie de course.
 */
export interface CourseShape {
  /** Part du D+ dans chaque tiers de la distance (début, milieu, fin), en %. */
  gainThirds: [number, number, number]
  /** Part du D- dans chaque tiers, en %. */
  lossThirds: [number, number, number]
  /** Où se concentre le D+ : un tiers qui porte au moins 45 % du D+, sinon « even ». */
  focus: 'start' | 'middle' | 'end' | 'even'
  /** Plus grosse montée continue. */
  biggestClimb: { startKm: number; endKm: number; gain: number; grade: number } | null
  /** Plus grosse descente continue. */
  biggestDescent: { startKm: number; endKm: number; loss: number; grade: number } | null
  /** Part de la distance où la pente reste sous 5 % (courable sans marcher), en %. */
  runnablePct: number
  /** D+ par km. */
  gainPerKm: number
}

export function courseShape(c: CourseProfile): CourseShape {
  const total = c.distanceKm || c.profile[c.profile.length - 1]?.[0] || 1
  const gain = [0, 0, 0]
  const loss = [0, 0, 0]
  let flat = 0
  for (let i = 1; i < c.profile.length; i++) {
    const [k0, e0] = c.profile[i - 1]
    const [k1, e1] = c.profile[i]
    const third = Math.min(2, Math.floor((((k0 + k1) / 2) / total) * 3))
    const d = e1 - e0
    if (d > 0) gain[third] += d
    else loss[third] -= d
    const dist = (k1 - k0) * 1000
    if (dist > 0 && Math.abs(d / dist) < 0.05) flat += k1 - k0
  }
  const pct = (xs: number[]) => {
    const s = xs.reduce((a, x) => a + x, 0)
    return (s ? xs.map((x) => Math.round((x / s) * 100)) : [33, 33, 34]) as [number, number, number]
  }
  const gainThirds = pct(gain)
  const top = gainThirds.indexOf(Math.max(...gainThirds))
  const climbs = c.segments.filter((s) => s.kind === 'climb').sort((a, b) => b.elevation - a.elevation)
  const descents = c.segments.filter((s) => s.kind === 'descent').sort((a, b) => b.elevation - a.elevation)
  return {
    gainThirds,
    lossThirds: pct(loss),
    focus: gainThirds[top] >= 45 ? (['start', 'middle', 'end'] as const)[top] : 'even',
    biggestClimb: climbs[0] ? { startKm: climbs[0].startKm, endKm: climbs[0].endKm, gain: climbs[0].elevation, grade: climbs[0].grade } : null,
    biggestDescent: descents[0] ? { startKm: descents[0].startKm, endKm: descents[0].endKm, loss: descents[0].elevation, grade: descents[0].grade } : null,
    runnablePct: Math.round((flat / total) * 100),
    gainPerKm: Math.round(c.gain / total),
  }
}

const FOCUS_EN = { start: 'in the first third', middle: 'in the middle third', end: 'in the last third', even: 'spread across the course' }
const FOCUS_FR = { start: 'concentré sur le premier tiers', middle: 'concentré sur le tiers central', end: 'concentré sur le dernier tiers', even: 'réparti sur tout le parcours' }

/** Résumé pour le coureur (anglais). */
export function shapeSummary(s: CourseShape) {
  const share = s.focus === 'even' ? '' : ` (${Math.max(...s.gainThirds)}% of the climbing)`
  return [
    `Most of the climbing is ${FOCUS_EN[s.focus]}${share}.`,
    s.biggestClimb && `Biggest climb: ${s.biggestClimb.gain} m from km ${s.biggestClimb.startKm} to ${s.biggestClimb.endKm} (${Math.abs(s.biggestClimb.grade)}%).`,
    s.biggestDescent && `Biggest descent: ${s.biggestDescent.loss} m from km ${s.biggestDescent.startKm} to ${s.biggestDescent.endKm}.`,
    `${s.runnablePct}% of the course is runnable (under 5% grade).`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Description pour le prompt du coach (français). */
export function describeShape(s: CourseShape) {
  return [
    `Répartition du D+ par tiers de distance : début ${s.gainThirds[0]} %, milieu ${s.gainThirds[1]} %, fin ${s.gainThirds[2]} % (${FOCUS_FR[s.focus]}). D- par tiers : ${s.lossThirds.join(' / ')} %.`,
    s.biggestClimb && `Plus grosse montée : ${s.biggestClimb.gain} m du km ${s.biggestClimb.startKm} au km ${s.biggestClimb.endKm} (${s.biggestClimb.grade} %).`,
    s.biggestDescent && `Plus grosse descente : ${s.biggestDescent.loss} m du km ${s.biggestDescent.startKm} au km ${s.biggestDescent.endKm} (${s.biggestDescent.grade} %).`,
    `Part courable (pente < 5 %) : ${s.runnablePct} % ; ${s.gainPerKm} m D+ par km.`,
  ]
    .filter(Boolean)
    .join('\n')
}
