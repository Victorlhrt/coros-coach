/**
 * Étapes d'un parcours d'onboarding. Le front affiche chaque étape selon son `kind`
 * et range la réponse sous `field` : les champs connus (distance, race_date, level, weekly_km, days)
 * servent à créer la demande de plan à la fin du parcours.
 */
export type OnboardingStep = {
  id: string
  kind: 'choice' | 'multi' | 'number' | 'date' | 'text' | 'days' | 'coros'
  title: string
  help?: string
  field: string
  options?: { value: string; label: string; hint?: string }[]
  min?: number
  max?: number
  unit?: string
  optional?: boolean
}

export type VariantSeed = {
  id: string
  name: string
  description: string
  status: 'draft' | 'live' | 'archived'
  weight: number
  steps: OnboardingStep[]
}

const distance: OnboardingStep = {
  id: 'distance',
  kind: 'choice',
  title: 'Quelle course prépares-tu ?',
  field: 'distance',
  options: [
    { value: '5k', label: '5 km' },
    { value: '10k', label: '10 km' },
    { value: 'half', label: 'Semi-marathon' },
    { value: 'marathon', label: 'Marathon' },
    { value: 'trail', label: 'Trail' },
  ],
}

const raceDate: OnboardingStep = {
  id: 'race_date',
  kind: 'date',
  title: 'Quand a lieu la course ?',
  help: 'Le plan remonte le temps depuis cette date.',
  field: 'race_date',
}

const level: OnboardingStep = {
  id: 'level',
  kind: 'choice',
  title: 'Comment décrirais-tu ton niveau ?',
  field: 'level',
  options: [
    { value: 'beginner', label: 'Je débute', hint: 'Moins d’un an de course régulière' },
    { value: 'intermediate', label: 'Intermédiaire', hint: 'Quelques courses au compteur' },
    { value: 'advanced', label: 'Confirmé', hint: 'Entraînement structuré, objectifs chrono' },
  ],
}

const weeklyKm: OnboardingStep = {
  id: 'weekly_km',
  kind: 'number',
  title: 'Combien de kilomètres cours-tu par semaine ?',
  help: 'Moyenne des quatre dernières semaines.',
  field: 'weekly_km',
  min: 0,
  max: 200,
  unit: 'km',
}

const days: OnboardingStep = {
  id: 'days',
  kind: 'days',
  title: 'Quels jours peux-tu courir ?',
  field: 'days',
}

const coros: OnboardingStep = {
  id: 'coros',
  kind: 'coros',
  title: 'Connecte ta montre COROS',
  help: 'On lit ton historique pour calibrer les allures, puis on envoie les séances sur ta montre.',
  field: 'coros_connected',
  optional: true,
}

export const DEFAULT_VARIANTS: VariantSeed[] = [
  {
    id: 'classique',
    name: 'Classique',
    description: 'Objectif, niveau, volume et disponibilités : le parcours complet.',
    status: 'live',
    weight: 50,
    steps: [distance, raceDate, level, weeklyKm, days],
  },
  {
    id: 'express',
    name: 'Express',
    description: 'Trois questions puis le plan : on affine ensuite avec les données de la montre.',
    status: 'live',
    weight: 50,
    steps: [distance, raceDate, level],
  },
  {
    id: 'coros-first',
    name: 'COROS d’abord',
    description: 'On connecte la montre avant tout pour pré-remplir niveau et volume.',
    status: 'draft',
    weight: 0,
    steps: [coros, distance, raceDate, days],
  },
]
