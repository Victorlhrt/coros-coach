import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Modèles proposés, du moins cher au plus cher (prix Anthropic par million de tokens). */
export const MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', price: '1 $ / 5 $' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', price: '2 $ / 10 $' },
] as const

export const DEFAULT_MODEL = MODELS[0].id

interface SettingsState {
  model: string
  units: 'metric' | 'imperial'
  theme: 'dark' | 'light'
  /** Bilan automatique à chaque nouvelle semaine */
  autoReview: boolean
  /** Verrouillage après N minutes en arrière-plan (si le verrou est actif) */
  autoLockMinutes: number
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      model: DEFAULT_MODEL,
      units: 'metric',
      theme: 'dark',
      autoReview: true,
      autoLockMinutes: 5,
      set: (patch) => set(patch),
    }),
    {
      name: 'coach.settings',
      version: 2,
      // Liste explicite : aucun champ inconnu (ex. ancienne clé API) n'est réécrit.
      partialize: ({ model, units, theme, autoReview, autoLockMinutes }) => ({ model, units, theme, autoReview, autoLockMinutes }),
      // v0 avait Sonnet 5 par défaut : on passe au modèle le moins cher.
      migrate: (state, version) => {
        // v2 : la clé API est sur le serveur, on l'efface des réglages locaux.
        const { anthropicKey: _removed, ...s } = state as SettingsState & { anthropicKey?: string }
        return version < 1 && s.model === 'claude-sonnet-5' ? { ...s, model: DEFAULT_MODEL } : s
      },
    },
  ),
)
