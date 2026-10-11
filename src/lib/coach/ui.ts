import type { SessionType } from './schema'

/** Libellé et couleur de chaque type de séance (mêmes couleurs partout). */
export const TYPE_META: Record<SessionType | 'rest', { label: string; color: string }> = {
  easy: { label: 'Endurance', color: 'var(--session-easy)' },
  tempo: { label: 'Tempo / seuil', color: 'var(--session-tempo)' },
  interval: { label: 'Fractionné', color: 'var(--session-interval)' },
  long: { label: 'Sortie longue', color: 'var(--session-long)' },
  recovery: { label: 'Récupération', color: 'var(--session-recovery)' },
  strength: { label: 'Renforcement', color: 'var(--session-strength)' },
  race: { label: 'Course', color: 'var(--session-race)' },
  rest: { label: 'Repos', color: 'var(--session-rest)' },
}

export const zoneColor = (zone: number) => `var(--zone-${Math.min(6, Math.max(1, zone))})`

export const PHASE_LABEL = { base: 'Base', build: 'Spécifique', peak: 'Pic', taper: 'Affûtage', race: 'Course' } as const

export const STEP_LABEL = { warmup: 'Échauffement', work: 'Effort', recovery: 'Récup', cooldown: 'Retour au calme' } as const
