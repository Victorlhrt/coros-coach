import { distanceCategory, effortKm } from './estimate'

/**
 * Volume hebdomadaire recommandé à l'onboarding : ce qui est idéal pour progresser et tenir l'objectif, pas ce que
 * le coureur pense pouvoir faire. Le coureur peut le réduire ensuite, mais c'est la proposition par défaut.
 *
 * Volume de pointe visé (semaine la plus chargée avant l'affûtage) :
 * - trail et ultra (plus de 42 km) : le volume de la course (distance-effort, 100 m D+ = 1 km), entre 40 et 100 km ;
 * - route : repères des plans classiques pour un coureur intermédiaire, corrigés par le niveau (débutant ×0,75,
 *   confirmé ×1,15) et l'ambition (objectif plus rapide que la prédiction → plus de volume, et l'inverse, modérément).
 * Puis borné par :
 * - le temps disponible : +6 % par semaine en moyenne, ou selon le niveau +2 km (débutant), +3 km (intermédiaire),
 *   +5 km (confirmé) par semaine de montée (une semaine allégée sur quatre), jusqu'à deux semaines de la course ;
 *   sans date, +30 % (ou +10 km) ;
 * - le nombre de jours : au plus ~16 km par jour couru en moyenne.
 * Jamais en dessous du volume actuel : on ne recommande pas de courir moins.
 */

const PEAK_KM: Record<string, number> = { '5k': 35, '10k': 45, half: 55, marathon: 70 }
const LEVEL_FACTOR: Record<string, number> = { debutant: 0.75, intermediaire: 1, confirme: 1.15 }
/** Hausse hebdomadaire moyenne possible depuis un petit volume (km). */
const LEVEL_STEP: Record<string, number> = { debutant: 2, intermediaire: 3, confirme: 5 }

export type RecommendInput = {
  /** Volume actuel (km/semaine). */
  currentKm: number
  /** Distance de l'objectif (km) et dénivelé, null pour « m'entraîner » sans course. */
  raceKm: number | null
  elevation?: number
  /** Course choisie en trail (même si son D+ est inconnu). */
  trail?: boolean
  /** Jours jusqu'à la course, null sans date. */
  daysToRace: number | null
  level?: string
  /** Temps visé et temps prédit (s), pour mesurer l'ambition. */
  target?: number | null
  predicted?: number | null
  /** Jours de course par semaine. */
  runDays: number
}

export type Recommendation = {
  /** Volume de pointe recommandé (km/semaine). */
  peakKm: number
  /** Volume de pointe idéal pour la course, avant la limite de progression : au-dessus de peakKm, le temps manque. */
  idealKm: number
  /** Volume moyen approximatif du plan, de la semaine 1 au pic (km/semaine). */
  averageKm: number
  /** Temps de course hebdomadaire correspondant (min), à allure d'endurance. */
  weeklyMinutes: number
  /** Allure d'endurance utilisée pour convertir (s/km). */
  easyPace: number
}

const round5 = (n: number) => Math.round(n / 5) * 5

export function recommendVolume(i: RecommendInput): Recommendation {
  const current = Math.max(0, i.currentKm)
  const category = i.raceKm ? (i.trail ? 'trail' : distanceCategory(i.raceKm, i.elevation ?? 0)) : null
  let peak: number
  if (i.raceKm && (category === 'trail' || i.raceKm > 43)) {
    // Trail et ultra : se rapprocher du volume de la course.
    peak = Math.min(100, Math.max(40, effortKm(i.raceKm, i.elevation ?? 0)))
  } else {
    peak = PEAK_KM[category ?? '10k'] * (LEVEL_FACTOR[i.level ?? 'intermediaire'] ?? 1)
    if (i.target && i.predicted) {
      // 3 % plus rapide que la prédiction ≈ 10 % de volume en plus ; borné entre −15 % et +20 %.
      const ambition = Math.pow(i.predicted / i.target, 3)
      peak *= Math.min(1.2, Math.max(0.85, ambition))
    }
  }
  if (i.runDays > 0) peak = Math.min(peak, i.runDays * 16)
  const ideal = peak

  // Progression : +6 % ou +2 à +5 km par semaine selon le niveau (semaines allégées comprises), jusqu'à deux semaines de la course.
  const start = Math.max(current, 10)
  if (i.daysToRace !== null) {
    const weeks = Math.max(0, Math.floor(i.daysToRace / 7) - 2)
    // Une semaine allégée toutes les 4 : elle ne fait pas monter le volume (même règle que le coach).
    const build = weeks - Math.floor(weeks / 4)
    const step = LEVEL_STEP[i.level ?? 'intermediaire'] ?? 3
    peak = Math.min(peak, Math.max(start * Math.pow(1.06, weeks), start + step * build))
  } else peak = Math.min(peak, Math.max(start * 1.3, start + 10))

  const peakKm = Math.max(round5(peak), Math.round(current))
  // Allure d'endurance : allure de course visée + 25 %, sinon 6:00 /km.
  const racePace = i.raceKm && (i.target ?? i.predicted) ? (i.target ?? i.predicted)! / effortKm(i.raceKm, i.elevation ?? 0) : null
  const easyPace = racePace ? Math.min(450, Math.max(270, racePace * 1.25)) : 360
  return {
    peakKm,
    idealKm: Math.max(round5(ideal), peakKm),
    averageKm: Math.round((Math.max(current, 10) + peakKm) / 2),
    weeklyMinutes: Math.round((peakKm * easyPace) / 60 / 15) * 15,
    easyPace,
  }
}

/** Créneaux proposés quand le coureur veut réduire : tous sous le temps recommandé, au moins 1 h 30. */
export function reducedOptions(recommendedMinutes: number) {
  const steps = [90, 120, 150, 180, 240, 300, 360, 420, 480]
  return steps.filter((m) => m < recommendedMinutes).slice(-4)
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`
}

/** Ce qu'offre le terrain autour du coureur pour travailler le dénivelé. */
export type TerrainAccess = 'hills' | 'mountain' | 'stairs' | 'treadmill' | 'flat'

export type GainInput = {
  raceKm: number
  raceGain: number
  /** D+ hebdomadaire actuel (m). */
  currentGain: number
  daysToRace: number | null
  level?: string
  access: TerrainAccess[]
  /** Volume de pointe recommandé (km/semaine), pour garder une densité de D+ réaliste. */
  peakKm: number
}

/**
 * D+ hebdomadaire de pointe recommandé en trail : le volume compte autant que le dénivelé.
 * Repère : la semaine la plus chargée approche le D+ de la course sur un format court, puis une part décroissante
 * avec la longueur (75 % jusqu'à 100 km, 60 % au-delà), corrigée par le niveau. Densité plafonnée à 1,3 fois celle
 * de la course, progression ≤ +10 % par semaine depuis le D+ actuel, et plafond selon le terrain disponible
 * (sans relief proche, escaliers et tapis incliné ne remplacent pas une montagne).
 */
export function recommendGain(i: GainInput) {
  const share = i.raceKm <= 30 ? 1.2 : i.raceKm <= 60 ? 1 : i.raceKm <= 100 ? 0.75 : 0.6
  let peak = i.raceGain * share * (LEVEL_FACTOR[i.level ?? 'intermediaire'] ?? 1)
  peak = Math.min(peak, i.peakKm * (i.raceGain / Math.max(1, i.raceKm)) * 1.3, 6000)
  if (i.daysToRace !== null) {
    const start = Math.max(i.currentGain, 200)
    peak = Math.min(peak, start * Math.pow(1.1, Math.max(0, Math.floor(i.daysToRace / 7) - 2)))
  }
  const outdoors = i.access.includes('mountain') || i.access.includes('hills')
  const indoor = i.access.includes('stairs') || i.access.includes('treadmill')
  if (!outdoors) peak = Math.min(peak, indoor ? 2000 : 1000)
  return Math.max(Math.round(peak / 100) * 100, Math.round(i.currentGain / 100) * 100)
}
