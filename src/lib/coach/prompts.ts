import { DISTANCES, type Goal, type Profile, type Zone } from './schema'
import { WEEKDAYS, formatDay } from './dates'
import { formatClock, formatPace } from './format'

export const COACH_SYSTEM = `Tu es un coach de course à pied expérimenté (méthodes type Daniels, Pfitzinger, Canova adaptées au niveau).
Tu écris en français, avec un ton direct et bienveillant.

Principes :
- Périodisation : base (endurance, volume) → spécifique (allure de course, seuil, VMA) → affûtage (volume réduit de 30 à 50 %, intensité conservée).
- 80 % du volume en endurance facile (zones 1-2). Une à deux séances de qualité par semaine maximum, jamais deux jours durs d'affilée.
- Hausse de volume ≤ 10 % par semaine, une semaine allégée (-20 à -30 %) toutes les 3 à 4 semaines.
- Sortie longue ≤ 30 % du volume hebdo (sauf trail long), plafonnée selon la distance visée.
- Chaque séance de qualité commence par un échauffement (10-20 min zone 1-2) et finit par un retour au calme (5-15 min).
- Respecte strictement les jours disponibles donnés et le jour de sortie longue.

Format des blocs :
- target "time" en secondes ou "distance" en mètres, entiers.
- zone 1 à 6 : 1 récupération, 2 endurance, 3 tempo / allure marathon, 4 seuil, 5 VMA, 6 sprint.
- paceFast / paceSlow (secondes/km) pour les blocs de qualité (zones 3 à 6), tirés du tableau des zones ou de l'allure objectif ; null pour l'endurance, la récupération, l'échauffement et le retour au calme (pilotage à la fréquence cardiaque).
- Un fractionné = un bloc "repeat" (repeats 1 à 20) contenant uniquement des étapes work et recovery.
- Pas de séance de repos : un jour sans séance est un jour de repos.
- Renforcement (type strength) : blocks vide, strengthMinutes renseigné, exercices dans la description.`

export function describeZones(zones: Zone[]) {
  return zones.map((z) => `Z${z.zone} ${z.name} : ${formatPace(z.paceFast)}–${formatPace(z.paceSlow)} /km`).join('\n')
}

export function describeGoal(goal: Goal) {
  const lines = [
    `Objectif : ${DISTANCES[goal.distance]}${goal.distance === 'trail' && goal.trailKm ? ` de ${goal.trailKm} km${goal.trailElevation ? `, ${goal.trailElevation} m D+` : ''}` : ''}`,
    `Date de course : ${goal.raceDate} (${formatDay(goal.raceDate)})`,
    `Temps visé : ${goal.targetTime ? formatClock(goal.targetTime) : 'non précisé (finir en forme)'}`,
    `Niveau : ${{ beginner: 'débutant', intermediate: 'intermédiaire', advanced: 'confirmé' }[goal.level]}`,
    `Jours disponibles : ${goal.days.map((d) => WEEKDAYS[d]).join(', ')}`,
    `Jour de sortie longue : ${WEEKDAYS[goal.longRunDay]}`,
    `Renforcement : ${goal.strength ? 'oui, 1 séance de 20-30 min par semaine sur un jour disponible' : 'non'}`,
  ]
  return lines.join('\n')
}

export function describeProfile(profile: Profile | null) {
  if (!profile) return 'Données COROS : indisponibles (pars d’un niveau prudent).'
  const p = profile.predictions
  const pred = [
    p.fiveK && `5 km ${formatClock(p.fiveK)}`,
    p.tenK && `10 km ${formatClock(p.tenK)}`,
    p.half && `semi ${formatClock(p.half)}`,
    p.marathon && `marathon ${formatClock(p.marathon)}`,
  ].filter(Boolean)
  return [
    'Données COROS :',
    profile.thresholdPace && `- allure seuil : ${formatPace(profile.thresholdPace)} /km`,
    profile.lthr && `- FC seuil : ${profile.lthr} bpm`,
    profile.vo2max && `- VO2max : ${profile.vo2max}`,
    pred.length > 0 && `- prédictions : ${pred.join(', ')}`,
    profile.weeklyKm != null && `- volume moyen récent : ${profile.weeklyKm} km/semaine`,
    profile.longestRunKm != null && `- plus longue sortie récente : ${profile.longestRunKm} km`,
    profile.runsPerWeek != null && `- sorties par semaine : ${profile.runsPerWeek}`,
    `- ${profile.notes}`,
  ]
    .filter(Boolean)
    .join('\n')
}
