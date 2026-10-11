import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Modèles proposés, du moins cher au plus cher (prix Anthropic par million de tokens). */
export const MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', price: '1 $ / 5 $' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', price: '2 $ / 10 $' },
] as const

export const DEFAULT_MODEL = MODELS[0].id

interface SettingsState {
  anthropicKey: string
  model: string
  units: 'metric' | 'imperial'
  theme: 'dark' | 'light'
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      anthropicKey: '',
      model: DEFAULT_MODEL,
      units: 'metric',
      theme: 'dark',
      set: (patch) => set(patch),
    }),
    {
      name: 'coach.settings',
      version: 1,
      // v0 avait Sonnet 5 par défaut : on passe au modèle le moins cher.
      migrate: (state, version) => {
        const s = state as SettingsState
        return version < 1 && s.model === 'claude-sonnet-5' ? { ...s, model: DEFAULT_MODEL } : s
      },
    },
  ),
)
