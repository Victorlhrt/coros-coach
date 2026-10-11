import { create } from 'zustand'
import { vault } from '@/lib/lock/vault'

const TOKENS_KEY = 'coros.tokens'

interface CorosAuthState {
  connected: boolean
  refresh: () => void
}

/** Indique si des tokens COROS sont présents dans le coffre ; rafraîchi à chaque changement. */
export const useCorosAuth = create<CorosAuthState>((set) => ({
  connected: false,
  refresh: () => set({ connected: vault.get(TOKENS_KEY) !== undefined }),
}))

vault.subscribe(() => useCorosAuth.getState().refresh())

export { TOKENS_KEY }
