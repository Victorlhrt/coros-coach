import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { today } from '@/lib/coach/dates'
import { withIds } from '@/lib/coach/generate'
import { fixLongRuns } from '@/lib/coach/longrun'
import { fixPaces, repacePlan } from '@/lib/coach/repace'
import type { Feedback } from '@/lib/coach/feedback'
import type { Adjustment, Goal, Plan, Profile, Session, Zone } from '@/lib/coach/schema'
import type { RaceRecord } from '@/lib/coach/vdot'
import type { Volume } from '@/lib/coach/volume'
import { DEFAULT_ZONES } from '@/lib/coach/zones'

interface CorosSync {
  /** Plan ID COROS de l'exécution en cours (null tant que le plan n'est pas envoyé). */
  planId: string | null
  /** true si le plan a été créé sur COROS, même si son ID n'a pas pu être retrouvé. */
  created: boolean
  /** Empreinte de chaque jour au moment de l'envoi. */
  synced: Record<string, string>
}

/** Activité COROS liée à une séance. labelId null = déliée volontairement (pas de liaison auto). */
export interface ActivityLink {
  labelId: string | null
  sportType: number
  auto: boolean
}

/** Bilan hebdomadaire proposé par Claude. */
export interface Review {
  createdAt: string
  adjustment: Adjustment
  status: 'pending' | 'applied' | 'dismissed'
}

interface PlanState {
  goal: Goal | null
  profile: Profile | null
  zones: Zone[]
  plan: Plan | null
  coros: CorosSync
  links: Record<string, ActivityLink>
  /** Ressenti par séance */
  feedback: Record<string, Feedback>
  /** Records des 12 derniers mois (COROS ou saisis) */
  records: RaceRecord[]
  /** Volume réel calculé depuis COROS */
  volume: Volume | null
  /** Bilans par numéro de semaine */
  reviews: Record<number, Review>
  setGoal: (goal: Goal) => void
  setProfile: (profile: Profile | null) => void
  setZones: (zones: Zone[]) => void
  /** Nouvelle allure seuil : zones remplacées et allures des séances à venir recalculées. Renvoie les dates des séances modifiées. */
  retuneZones: (zones: Zone[]) => string[]
  /** Séances à venir : allures cibles incohérentes avec leur zone ramenées à l'allure de la zone. */
  repairPaces: () => void
  /** Semaines à venir : la sortie longue redevient la plus longue sortie de la semaine. */
  repairLongRuns: () => void
  setPlan: (plan: Plan) => void
  setCoros: (patch: Partial<CorosSync>) => void
  markSynced: (hashes: Record<string, string>) => void
  applyChanges: (changes: Adjustment['changes']) => void
  setLinks: (links: Record<string, ActivityLink>) => void
  setRecords: (records: RaceRecord[]) => void
  setFeedback: (sessionId: string, feedback: Feedback | null) => void
  setVolume: (volume: Volume | null) => void
  saveReview: (week: number, adjustment: Adjustment) => void
  setReviewStatus: (week: number, status: Review['status']) => void
  importData: (data: unknown) => void
  reset: () => void
}

/** Objectif d'avant le profil de parcours (trailKm / trailElevation) → format actuel. */
function migrateGoal(goal: unknown): Goal | null {
  if (!goal || typeof goal !== 'object') return null
  const g = goal as Record<string, unknown>
  return {
    courseKm: (g.trailKm as number | null) ?? null,
    elevationGain: (g.trailElevation as number | null) ?? null,
    terrain: g.distance === 'trail' ? 'trail' : 'road',
    course: null,
    currentWeeklyKm: null,
    ...g,
  } as Goal
}

const EMPTY_SYNC: CorosSync = { planId: null, created: false, synced: {} }

export const usePlan = create<PlanState>()(
  persist(
    (set, get) => ({
      goal: null,
      profile: null,
      zones: DEFAULT_ZONES,
      plan: null,
      coros: EMPTY_SYNC,
      links: {},
      reviews: {},
      records: [],
      volume: null,
      feedback: {},
      setGoal: (goal) => set({ goal }),
      setProfile: (profile) => set({ profile }),
      setZones: (zones) => set({ zones }),
      retuneZones: (zones) => {
        const s = get()
        const { plan, changed } = s.plan ? repacePlan(s.plan, s.zones, zones, s.goal, today()) : { plan: null, changed: [] }
        set({ zones, plan })
        return changed
      },
      repairPaces: () => {
        const s = get()
        if (!s.plan) return
        const { plan, changed } = fixPaces(s.plan, s.zones, s.goal, today())
        if (changed.length) set({ plan })
      },
      repairLongRuns: () => {
        const s = get()
        if (!s.plan) return
        const done = new Set(Object.entries(s.links).flatMap(([id, l]) => (l.labelId ? [id] : [])))
        const { plan, changed } = fixLongRuns(s.plan, s.zones, today(), done)
        if (changed.length) set({ plan })
      },
      setPlan: (plan) => set({ plan, coros: EMPTY_SYNC, links: {}, reviews: {}, feedback: {} }),
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
      setLinks: (links) => set((s) => ({ links: { ...s.links, ...links } })),
      setRecords: (records) => set({ records }),
      setFeedback: (sessionId, feedback) =>
        set((s) => {
          const next = { ...s.feedback }
          if (feedback) next[sessionId] = feedback
          else delete next[sessionId]
          return { feedback: next }
        }),
      setVolume: (volume) => set({ volume }),
      saveReview: (week, adjustment) =>
        set((s) => ({ reviews: { ...s.reviews, [week]: { createdAt: new Date().toISOString(), adjustment, status: 'pending' } } })),
      setReviewStatus: (week, status) =>
        set((s) => (s.reviews[week] ? { reviews: { ...s.reviews, [week]: { ...s.reviews[week], status } } } : s)),
      importData: (data) => {
        const d = data as Partial<PlanState>
        if (!d || typeof d !== 'object' || !d.plan?.weeks) throw new Error('Invalid file: no plan found.')
        set({
          goal: migrateGoal(d.goal),
          profile: d.profile ?? null,
          zones: d.zones ?? DEFAULT_ZONES,
          plan: d.plan,
          coros: d.coros ?? EMPTY_SYNC,
          links: d.links ?? {},
          reviews: d.reviews ?? {},
          records: d.records ?? [],
          feedback: d.feedback ?? {},
          volume: d.volume ?? null,
        })
      },
      reset: () => set({ plan: null, coros: EMPTY_SYNC, links: {}, reviews: {}, feedback: {} }),
    }),
    {
      name: 'coach.plan',
      version: 1,
      // v0 : objectif sans profil de parcours (trailKm / trailElevation).
      migrate: (state, version) => {
        const s = state as Record<string, unknown>
        if (version < 1) s.goal = migrateGoal(s.goal)
        return { links: {}, reviews: {}, records: [], volume: null, feedback: {}, ...s } as unknown as PlanState
      },
    },
  ),
)

export function allSessions(plan: Plan | null) {
  return plan?.weeks.flatMap((w) => w.sessions) ?? []
}

/**
 * À monter une fois : corrige les séances à venir dès que le plan ou les zones changent (y compris à la synchro) :
 * allures cohérentes avec leur zone, sortie longue plus longue que les footings.
 */
export function usePlanRepair() {
  const plan = usePlan((s) => s.plan)
  const zones = usePlan((s) => s.zones)
  useEffect(() => {
    usePlan.getState().repairPaces()
    usePlan.getState().repairLongRuns()
  }, [plan, zones])
}
