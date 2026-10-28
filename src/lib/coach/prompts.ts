import { DISTANCES_FR as DISTANCES, TERRAINS_FR as TERRAINS, type Goal, type Profile, type Zone } from './schema'
import { WEEKDAYS_FR as WEEKDAYS, formatDayFr as formatDay } from './dates'
import { formatClock, formatPace } from './format'
import { RECORD_DISTANCES, bestVdot, predictTime, thresholdPace, type RaceRecord } from './vdot'

export const COACH_SYSTEM = `Tu es un coach de course à pied expérimenté (méthodes type Daniels, Pfitzinger, Canova adaptées au niveau).
Tu écris en français, avec un ton direct et bienveillant.

Principes :
- Périodisation : base (endurance, volume) → spécifique (allure de course, seuil, VMA) → affûtage (volume réduit de 30 à 50 %, intensité conservée).
- 80 % du volume en endurance facile (zones 1-2). Une à deux séances de qualité par semaine maximum, jamais deux jours durs d'affilée.
- Hausse de volume ≤ 10 % par semaine, une semaine allégée (-20 à -30 %) toutes les 3 à 4 semaines.
- Sortie longue : elle progresse jusqu'à la longueur que demande l'objectif, atteinte 3 à 5 semaines avant la course : 10 km → 14-16 km, semi → 18-21 km, marathon → 30-34 km (plafond en durée : 3 h). Elle représente 30 à 40 % du volume hebdo ; si le volume est trop faible pour l'atteindre, fais monter le volume (≤ 10 % par semaine) plutôt que de raccourcir la sortie longue. Hausse de la sortie longue : 1 à 2 km par semaine, en recul les semaines allégées. Dès la première semaine, c'est la plus longue sortie de la semaine : aucune autre séance ne la dépasse.
- Sorties longues spécifiques : en phase spécifique (build, peak), environ une sortie longue sur deux intègre des blocs à l'allure de course objectif (bloc "repeat" ou blocs work avec paceFast/paceSlow), par exemple 3 × 3 km allure semi avec 1 km facile entre, les 5 à 8 derniers km à allure marathon, ou une progressive qui finit à allure course. Elle compte alors comme une des séances de qualité de la semaine. En base, sortie longue facile, éventuellement avec quelques accélérations ; en affûtage, plus courte avec un bloc d'allure bref.
- Semaine de course : chaque sortie avant la course garde une activation, jamais un footing purement facile. Par exemple 3 à 4 jours avant : 30-40 min facile avec 3 × 1 km à allure course ; 1 à 2 jours avant : 20-25 min facile avec 4 à 6 lignes droites de 20 s (blocs work courts en zone 5, récupération en marchant ou trottinant).
- Chaque séance de qualité commence par un échauffement (10-20 min zone 1-2) et finit par un retour au calme (5-15 min).
- Respecte strictement les jours disponibles donnés et le jour de sortie longue.

Format des blocs :
- target "time" en secondes ou "distance" en mètres, entiers.
- zone 1 à 6 : 1 récupération, 2 endurance, 3 tempo / allure marathon, 4 seuil, 5 VMA, 6 sprint.
- paceFast / paceSlow (secondes/km) pour les blocs de qualité (zones 3 à 6), tirés du tableau des zones ou de l'allure objectif, et toujours cohérents avec la zone de l'étape (un effort en zone 5 se court à l'allure Z5 du tableau, jamais à l'allure d'endurance) ; null pour l'endurance, la récupération, l'échauffement et le retour au calme (pilotage à la fréquence cardiaque).
- Un fractionné = un bloc "repeat" (repeats 1 à 20) contenant uniquement des étapes work et recovery.
- Pas de séance de repos : un jour sans séance est un jour de repos.
- Volume : l'app additionne les distances ; un bloc en durée est converti avec l'allure médiane de sa zone (tableau des zones). Donne l'endurance et la sortie longue en distance pour que le volume soit exact, et respecte le volume hebdomadaire visé à ±10 %.
- Renforcement (type strength) : blocks vide, strengthMinutes renseigné, exercices dans la description.

Spécificité du parcours :
- Si le parcours a du dénivelé, prépare-le : côtes courtes (VMA) et longues (seuil) en phase spécifique, sorties longues vallonnées, travail de descente (excentrique) avant une course descendante, renforcement des quadriceps.
- Pour une séance en côte, l'allure n'a pas de sens : pilote à la zone FC (paceFast/paceSlow null) avec des cibles en durée, et précise dans la description « en côte de 6-8 % » par exemple.
- En trail, raisonne en temps plutôt qu'en distance pour les sorties longues.`

export function describeZones(zones: Zone[]) {
  return zones.map((z) => `Z${z.zone} ${z.name} : ${formatPace(z.paceFast)}–${formatPace(z.paceSlow)} /km`).join('\n')
}

export function describeCourse(goal: Goal) {
  const c = goal.course
  if (!c) {
    if (!goal.elevationGain) return `Parcours : ${TERRAINS[goal.terrain].toLowerCase()}, profil non fourni.`
    return `Parcours : ${TERRAINS[goal.terrain].toLowerCase()}, ${goal.elevationGain} m D+.`
  }
  const segments = [...c.segments]
    .sort((a, b) => b.elevation - a.elevation)
    .slice(0, 10)
    .sort((a, b) => a.startKm - b.startKm)
    .map((s) => `- ${s.kind === 'climb' ? 'montée' : 'descente'} km ${s.startKm} → ${s.endKm} : ${s.elevation} m, ${s.grade} %`)
  return [
    `Parcours (GPX « ${c.name} ») : ${c.distanceKm} km, ${c.gain} m D+, ${c.loss} m D-, altitude ${c.minEle}–${c.maxEle} m, terrain ${TERRAINS[goal.terrain].toLowerCase()}.`,
    segments.length > 0 ? `Segments marquants :\n${segments.join('\n')}` : 'Parcours roulant, sans montée marquée.',
  ].join('\n')
}

export function describeGoal(goal: Goal) {
  const distance = goal.courseKm ?? goal.course?.distanceKm
  const lines = [
    `Objectif : ${DISTANCES[goal.distance]}${distance && (goal.distance === 'trail' || goal.course) ? ` (${distance} km)` : ''}`,
    `Date de course : ${goal.raceDate} (${formatDay(goal.raceDate)})`,
    `Temps visé : ${goal.targetTime ? formatClock(goal.targetTime) : 'non précisé (finir en forme)'}`,
    `Niveau : ${{ beginner: 'débutant', intermediate: 'intermédiaire', advanced: 'confirmé' }[goal.level]}`,
    `Jours disponibles : ${goal.days.map((d) => WEEKDAYS[d]).join(', ')}`,
    `Jour de sortie longue : ${WEEKDAYS[goal.longRunDay]}`,
    `Renforcement : ${goal.strength ? 'oui, 1 séance de 20-30 min par semaine sur un jour disponible' : 'non'}`,
    goal.currentWeeklyKm
      ? `Volume actuel : ${goal.currentWeeklyKm} km/semaine. C’est le point de départ : la semaine 1 doit être proche de ce volume (jamais une baisse brutale), puis progresser.`
      : 'Volume actuel : inconnu, pars prudemment.',
    describeCourse(goal),
  ]
  return lines.join('\n')
}

export function describeRecords(records: RaceRecord[]) {
  if (records.length === 0) return ''
  const v = bestVdot(records)!
  const lines = records.map((r) => {
    const d = RECORD_DISTANCES.find((x) => x.key === r.key)!
    return `- ${d.label} : ${formatClock(r.seconds)}${r.date ? ` (${r.date})` : ''}`
  })
  const preds = RECORD_DISTANCES.map((d) => `${d.label} ${formatClock(predictTime(v, d.meters))}`).join(', ')
  return `Records des 12 derniers mois :\n${lines.join('\n')}\nVDOT ${v} → allure seuil ${formatPace(thresholdPace(v))} /km ; équivalences : ${preds}.`
}

export function describeProfile(profile: Profile | null, records: RaceRecord[] = []) {
  const rec = describeRecords(records)
  if (!profile) return rec || 'Données COROS : indisponibles (pars d’un niveau prudent).'
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
    rec,
  ]
    .filter(Boolean)
    .join('\n')
}
