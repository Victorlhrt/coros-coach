import type { Zone } from './schema'

/**
 * Zones d'allure dérivées de l'allure seuil (secondes/km), numérotées comme les zones COROS
 * (1 récupération … 6 puissance anaérobie). Facteurs > 1 = plus lent que le seuil.
 */
const FACTORS: [number, string, number, number][] = [
  [1, 'Récupération', 1.29, 1.45],
  [2, 'Endurance', 1.15, 1.29],
  [3, 'Tempo', 1.06, 1.15],
  [4, 'Seuil', 0.99, 1.06],
  [5, 'VMA', 0.9, 0.99],
  [6, 'Sprint', 0.8, 0.9],
]

export function zonesFromThreshold(thresholdPace: number): Zone[] {
  return FACTORS.map(([zone, name, fast, slow]) => ({
    zone,
    name,
    paceFast: Math.round(thresholdPace * fast),
    paceSlow: Math.round(thresholdPace * slow),
  }))
}

/** Allure seuil par défaut (5:15/km) tant que COROS n'a rien fourni. */
export const DEFAULT_ZONES = zonesFromThreshold(315)

export const ZONE_NAMES = ['', 'Récupération', 'Endurance', 'Tempo', 'Seuil', 'VMA', 'Sprint']
