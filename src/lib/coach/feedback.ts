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

export const RPE_LABELS = ['', 'Très facile', 'Facile', 'Facile', 'Modéré', 'Modéré', 'Soutenu', 'Difficile', 'Très difficile', 'Extrême', 'Maximal']

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
