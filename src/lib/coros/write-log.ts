import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WriteLogEntry {
  id: string
  at: string
  tool: string
  summary: string
  args: unknown
  status: 'ok' | 'error' | 'cancelled'
  result?: unknown
  error?: string
}

interface WriteLogState {
  entries: WriteLogEntry[]
  add: (entry: WriteLogEntry) => void
  clear: () => void
}

/** Journal de toutes les tentatives d'écriture sur COROS (100 dernières). */
export const useWriteLog = create<WriteLogState>()(
  persist(
    (set) => ({
      entries: [],
      add: (entry) => set((s) => ({ entries: [entry, ...s.entries].slice(0, 100) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'coros.writeLog' },
  ),
)
