import { create } from 'zustand'

export interface ConfirmRequest {
  title: string
  description: string
  details?: unknown
  confirmLabel?: string
  resolve: (ok: boolean) => void
}

interface ConfirmState {
  pending: ConfirmRequest | null
  ask: (req: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>
  answer: (ok: boolean) => void
}

/** Boîte de confirmation globale, affichée par <ConfirmSheet />. */
export const useConfirm = create<ConfirmState>((set, get) => ({
  pending: null,
  ask: (req) =>
    new Promise<boolean>((resolve) => {
      get().pending?.resolve(false)
      set({ pending: { ...req, resolve } })
    }),
  answer: (ok) => {
    get().pending?.resolve(ok)
    set({ pending: null })
  },
}))
