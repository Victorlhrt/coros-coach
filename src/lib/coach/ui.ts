import type { SessionType } from './schema'

/** Libellé et couleur de chaque type de séance (mêmes couleurs partout). */
export const TYPE_META: Record<SessionType | 'rest', { label: string; color: string }> = {
  easy: { label: 'Easy', color: 'var(--session-easy)' },
  tempo: { label: 'Tempo / threshold', color: 'var(--session-tempo)' },
  interval: { label: 'Intervals', color: 'var(--session-interval)' },
  long: { label: 'Long run', color: 'var(--session-long)' },
  recovery: { label: 'Recovery', color: 'var(--session-recovery)' },
  strength: { label: 'Strength', color: 'var(--session-strength)' },
  race: { label: 'Race', color: 'var(--session-race)' },
  rest: { label: 'Rest', color: 'var(--session-rest)' },
}

export const zoneColor = (zone: number) => `var(--zone-${Math.min(6, Math.max(1, zone))})`

export const PHASE_LABEL = { base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper', race: 'Race' } as const

export const STEP_LABEL = { warmup: 'Warm-up', work: 'Work', recovery: 'Recovery', cooldown: 'Cool-down' } as const
