import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DEFAULT_MODEL = 'claude-sonnet-5'

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
    { name: 'coach.settings' },
  ),
)
