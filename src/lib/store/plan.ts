import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { withIds } from '@/lib/coach/generate'
import type { Adjustment, Goal, Plan, Profile, Session, Zone } from '@/lib/coach/schema'
import { DEFAULT_ZONES } from '@/lib/coach/zones'

interface CorosSync {
  /** Plan ID COROS de l'exécution en cours (null tant que le plan n'est pas envoyé). */
  planId: string | null
  /** true si le plan a été créé sur COROS, même si son ID n'a pas pu être retrouvé. */
  created: boolean
  /** Empreinte de chaque jour au moment de l'envoi. */
  synced: Record<string, string>
}

interface PlanState {
  goal: Goal | null
  profile: Profile | null
  zones: Zone[]
  plan: Plan | null
  coros: CorosSync
  setGoal: (goal: Goal) => void
  setProfile: (profile: Profile | null) => void
  setZones: (zones: Zone[]) => void
  setPlan: (plan: Plan) => void
  setCoros: (patch: Partial<CorosSync>) => void
  markSynced: (hashes: Record<string, string>) => void
  applyChanges: (changes: Adjustment['changes']) => void
  importData: (data: unknown) => void
  reset: () => void
}

const EMPTY_SYNC: CorosSync = { planId: null, created: false, synced: {} }

export const usePlan = create<PlanState>()(
  persist(
    (set) => ({
      goal: null,
      profile: null,
      zones: DEFAULT_ZONES,
      plan: null,
      coros: EMPTY_SYNC,
      setGoal: (goal) => set({ goal }),
      setProfile: (profile) => set({ profile }),
      setZones: (zones) => set({ zones }),
      setPlan: (plan) => set({ plan, coros: EMPTY_SYNC }),
      setCoros: (patch) => set((s) => ({ coros: { ...s.coros, ...patch } })),
      markSynced: (hashes) => set((s) => ({ coros: { ...s.coros, synced: { ...s.coros.synced, ...hashes } } })),
      applyChanges: (changes) =>
        set((s) => {
          if (!s.plan) return s
          const weeks = s.plan.weeks.map((w) => {
            let sessions: Session[] = w.sessions
            for (const c of changes) {
              if (c.date < w.start || c.date > w.end) continue
              if (c.action !== 'add') sessions = sessions.filter((x) => x.date !== c.date || x.type === 'strength')
              if (c.session) sessions = [...sessions, ...withIds([c.session])]
            }
            return { ...w, sessions: [...sessions].sort((a, b) => a.date.localeCompare(b.date)) }
          })
          return { plan: { ...s.plan, weeks } }
        }),
      importData: (data) => {
        const d = data as Partial<PlanState>
        if (!d || typeof d !== 'object' || !d.plan?.weeks) throw new Error('Fichier invalide : aucun plan trouvé.')
        set({
          goal: d.goal ?? null,
          profile: d.profile ?? null,
          zones: d.zones ?? DEFAULT_ZONES,
          plan: d.plan,
          coros: d.coros ?? EMPTY_SYNC,
        })
      },
      reset: () => set({ plan: null, coros: EMPTY_SYNC }),
    }),
    { name: 'coach.plan' },
  ),
)

export function allSessions(plan: Plan | null) {
  return plan?.weeks.flatMap((w) => w.sessions) ?? []
}
