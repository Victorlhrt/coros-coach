import { distanceCategory, effortKm } from './estimate'

/**
 * Volume hebdomadaire recommandé à l'onboarding : ce qui est idéal pour progresser et tenir l'objectif, pas ce que
 * le coureur pense pouvoir faire. Le coureur peut le réduire ensuite, mais c'est la proposition par défaut.
 *
 * Volume de pointe visé selon la distance (repères des plans classiques pour un coureur intermédiaire), corrigé par :
 * - le niveau (débutant ×0,75, confirmé ×1,15) ;
 * - l'ambition : un objectif plus rapide que la prédiction demande plus de volume (et l'inverse, modérément) ;
 * - le temps disponible : au plus +6 % par semaine en moyenne (semaines allégées comprises) jusqu'à deux semaines de la course ;
 *   sans date de course, au plus +30 % (ou +10 km) sur le volume actuel ;
 * - le nombre de jours : au plus ~16 km par jour couru en moyenne.
 * Jamais en dessous du volume actuel : on ne recommande pas de courir moins.
 */

const PEAK_KM: Record<string, number> = { '5k': 35, '10k': 45, half: 55, marathon: 70 }
const LEVEL_FACTOR: Record<string, number> = { debutant: 0.75, intermediaire: 1, confirme: 1.15 }

export type RecommendInput = {
  /** Volume actuel (km/semaine). */
  currentKm: number
  /** Distance de l'objectif (km) et dénivelé, null pour « m'entraîner » sans course. */
  raceKm: number | null
  elevation?: number
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
  /** Temps de course hebdomadaire correspondant (min), à allure d'endurance. */
  weeklyMinutes: number
  /** Allure d'endurance utilisée pour convertir (s/km). */
  easyPace: number
}

const round5 = (n: number) => Math.round(n / 5) * 5

export function recommendVolume(i: RecommendInput): Recommendation {
  const current = Math.max(0, i.currentKm)
  const category = i.raceKm ? distanceCategory(i.raceKm, i.elevation ?? 0) : null
  // Trail : la distance-effort (100 m D+ = 1 km) donne l'ordre de grandeur, entre 50 et 100 km.
  let peak = category === 'trail' ? Math.min(100, Math.max(50, effortKm(i.raceKm!, i.elevation ?? 0) * 1.1)) : PEAK_KM[category ?? '10k']
  peak *= LEVEL_FACTOR[i.level ?? 'intermediaire'] ?? 1

  if (i.target && i.predicted) {
    // 3 % plus rapide que la prédiction ≈ 10 % de volume en plus ; borné entre −15 % et +20 %.
    const ambition = Math.pow(i.predicted / i.target, 3)
    peak *= Math.min(1.2, Math.max(0.85, ambition))
  }

  // Progression : +6 % par semaine en moyenne (semaines allégées comprises), jusqu'à deux semaines de la course.
  const start = Math.max(current, 10)
  if (i.daysToRace !== null) peak = Math.min(peak, start * Math.pow(1.06, Math.max(0, Math.floor(i.daysToRace / 7) - 2)))
  else peak = Math.min(peak, Math.max(start * 1.3, start + 10))
  if (i.runDays > 0) peak = Math.min(peak, i.runDays * 16)

  const peakKm = Math.max(round5(peak), Math.round(current))
  // Allure d'endurance : allure de course visée + 25 %, sinon 6:00 /km.
  const racePace = i.raceKm && (i.target ?? i.predicted) ? (i.target ?? i.predicted)! / effortKm(i.raceKm, i.elevation ?? 0) : null
  const easyPace = racePace ? Math.min(450, Math.max(270, racePace * 1.25)) : 360
  return { peakKm, weeklyMinutes: Math.round((peakKm * easyPace) / 60 / 15) * 15, easyPace }
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
