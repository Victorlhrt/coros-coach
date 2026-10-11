import { create } from 'zustand'

const TOKENS_KEY = 'coros.tokens'

interface CorosAuthState {
  connected: boolean
  refresh: () => void
}

/** Indique si des tokens COROS sont présents ; rafraîchi à chaque écriture/suppression. */
export const useCorosAuth = create<CorosAuthState>((set) => ({
  connected: localStorage.getItem(TOKENS_KEY) !== null,
  refresh: () => set({ connected: localStorage.getItem(TOKENS_KEY) !== null }),
}))

export { TOKENS_KEY }
