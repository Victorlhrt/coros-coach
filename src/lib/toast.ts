import { create } from 'zustand'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, tone?: Toast['tone']) => void
  dismiss: (id: number) => void
}

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, tone = 'success') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
    setTimeout(() => get().dismiss(id), tone === 'error' ? 8000 : 3500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (e: unknown) => useToast.getState().show(e instanceof Error ? e.message : String(e), 'error'),
}
