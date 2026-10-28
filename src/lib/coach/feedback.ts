/** Ressenti du coureur sur une séance, pris en compte dans le bilan hebdomadaire. */
export interface Feedback {
  /** Note globale de la séance, 1 à 5 */
  rating: number
  /** Effort perçu (RPE), 1 à 10 */
  rpe: number
  tags: string[]
  comment: string
  at: string
}

export const FEELING_TAGS = [
  'Bonnes sensations',
  'Facile',
  'Jambes lourdes',
  'Fatigué',
  'Essoufflé',
  'Douleur',
  'Mal dormi',
  'Chaleur',
  'Stress',
  'Allures trop dures',
  'Allures trop faciles',
] as const
export type FeelingTag = (typeof FEELING_TAGS)[number]

/** Libellés affichés (les valeurs stockées et envoyées à Claude restent en français). */
export const FEELING_TAG_LABEL: Record<FeelingTag, string> = {
  'Bonnes sensations': 'Felt good',
  Facile: 'Easy',
  'Jambes lourdes': 'Heavy legs',
  Fatigué: 'Tired',
  Essoufflé: 'Out of breath',
  Douleur: 'Pain',
  'Mal dormi': 'Slept badly',
  Chaleur: 'Heat',
  Stress: 'Stress',
  'Allures trop dures': 'Paces too hard',
  'Allures trop faciles': 'Paces too easy',
}

export const RPE_LABELS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Steady', 'Hard', 'Very hard', 'Extreme', 'Max effort']

export function describeFeedback(f: Feedback) {
  return [
    `note ${f.rating}/5`,
    `RPE ${f.rpe}/10`,
    f.tags.length ? `sensations : ${f.tags.join(', ')}` : null,
    f.comment.trim() ? `commentaire : « ${f.comment.trim()} »` : null,
  ]
    .filter(Boolean)
    .join(' ; ')
}
