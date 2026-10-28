/**
 * Étapes d'un parcours d'onboarding. Le front affiche chaque étape selon son `kind`
 * et range la réponse sous `field` : les champs connus (distance, race_date, level, weekly_km, days)
 * servent à créer la demande de plan à la fin du parcours.
 */
/** Étapes riches du parcours « Complet », rendues par un composant dédié côté front. */
export type CompleteKind = 'reason' | 'wearables' | 'identity' | 'goal' | 'estimate' | 'health' | 'gear' | 'generate'

export type OnboardingStep = {
  id: string
  kind: 'choice' | 'multi' | 'number' | 'date' | 'text' | 'days' | 'coros' | CompleteKind
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
  title: 'What race are you training for?',
  field: 'distance',
  options: [
    { value: '5k', label: '5 km' },
    { value: '10k', label: '10 km' },
    { value: 'half', label: 'Half marathon' },
    { value: 'marathon', label: 'Marathon' },
    { value: 'trail', label: 'Trail' },
  ],
}

const raceDate: OnboardingStep = {
  id: 'race_date',
  kind: 'date',
  title: 'When is the race?',
  help: 'The plan counts back from this date.',
  field: 'race_date',
}

const level: OnboardingStep = {
  id: 'level',
  kind: 'choice',
  title: 'How would you describe your level?',
  field: 'level',
  options: [
    { value: 'beginner', label: 'Beginner', hint: 'Less than a year of regular running' },
    { value: 'intermediate', label: 'Intermediate', hint: 'A few races under your belt' },
    { value: 'advanced', label: 'Advanced', hint: 'Structured training, time goals' },
  ],
}

const weeklyKm: OnboardingStep = {
  id: 'weekly_km',
  kind: 'number',
  title: 'How many kilometres do you run per week?',
  help: 'Average over the last four weeks.',
  field: 'weekly_km',
  min: 0,
  max: 200,
  unit: 'km',
}

const days: OnboardingStep = {
  id: 'days',
  kind: 'days',
  title: 'Which days can you run?',
  field: 'days',
}

const coros: OnboardingStep = {
  id: 'coros',
  kind: 'coros',
  title: 'Connect your COROS watch',
  help: 'We read your history to calibrate your paces, then send sessions to your watch.',
  field: 'coros_connected',
  optional: true,
}

export const DEFAULT_VARIANTS: VariantSeed[] = [
  {
    id: 'classique',
    name: 'Classic',
    description: 'Goal, level, volume and availability: the full flow.',
    status: 'live',
    weight: 50,
    steps: [distance, raceDate, level, weeklyKm, days],
  },
  {
    id: 'express',
    name: 'Express',
    description: 'Three questions, then the plan: we refine it later with watch data.',
    status: 'live',
    weight: 50,
    steps: [distance, raceDate, level],
  },
  {
    id: 'coros-first',
    name: 'COROS first',
    description: 'Connect the watch first to pre-fill level and volume.',
    status: 'draft',
    weight: 0,
    steps: [coros, distance, raceDate, days],
  },
  {
    id: 'complet',
    name: 'Complete (test)',
    description: 'Motivation, watch, UTMB profile, goal and race, time estimate, health, shoes, then plan generation.',
    status: 'draft',
    weight: 0,
    steps: [
      { id: 'reason', kind: 'reason', title: 'What brings you to Raice.run?', field: 'reason' },
      { id: 'wearables', kind: 'wearables', title: 'What do you run with?', field: 'wearables' },
      { id: 'identity', kind: 'identity', title: 'Let’s get to know you', field: 'identity' },
      { id: 'goal', kind: 'goal', title: 'What’s your goal?', field: 'goal' },
      { id: 'estimate', kind: 'estimate', title: 'Your estimated time', field: 'estimate' },
      { id: 'health', kind: 'health', title: 'How’s your body feeling?', field: 'health' },
      { id: 'gear', kind: 'gear', title: 'Your shoes', field: 'gear' },
      { id: 'generate', kind: 'generate', title: 'Building your plan', field: 'generated', optional: true },
    ],
  },
]
