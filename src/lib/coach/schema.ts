import { z } from 'zod'
import type { CourseProfile } from './gpx'

/** Types de séance, avec un code couleur cohérent partout dans l'app. */
export const SESSION_TYPES = ['easy', 'tempo', 'interval', 'long', 'recovery', 'strength', 'race'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export const PHASES = ['base', 'build', 'peak', 'taper', 'race'] as const
export type Phase = (typeof PHASES)[number]

// --- Blocs d'une séance (calqués sur le format « course » de COROS) ---

export const StepSchema = z.object({
  kind: z.enum(['warmup', 'work', 'recovery', 'cooldown']),
  target: z.enum(['distance', 'time']).describe('distance en mètres ou durée en secondes'),
  value: z.number().int().describe('mètres si target=distance, secondes si target=time'),
  zone: z.number().int().describe('zone d’intensité 1 à 6 (1 récup, 2 endurance, 3 tempo, 4 seuil, 5 VMA, 6 sprint)'),
  paceFast: z.number().int().nullable().describe('allure cible la plus rapide en secondes/km, ou null pour piloter à la zone FC'),
  paceSlow: z.number().int().nullable().describe('allure cible la plus lente en secondes/km, ou null'),
})
export type Step = z.infer<typeof StepSchema>

export const RepeatSchema = z.object({
  kind: z.literal('repeat'),
  repeats: z.number().int().describe('nombre de répétitions, 1 à 20'),
  steps: z.array(StepSchema).describe('étapes répétées : uniquement work et recovery'),
})
export type Repeat = z.infer<typeof RepeatSchema>

export const BlockSchema = z.union([StepSchema, RepeatSchema])
export type Block = z.infer<typeof BlockSchema>

export const SessionSchema = z.object({
  date: z.string().describe('date de la séance, format YYYY-MM-DD'),
  type: z.enum(SESSION_TYPES),
  title: z.string().describe('nom court, ex. « 6 × 800 m VMA »'),
  description: z.string().describe('consigne claire pour l’athlète, 1 à 3 phrases'),
  blocks: z.array(BlockSchema).describe('vide pour le renforcement'),
  strengthMinutes: z.number().int().nullable().describe('durée du renforcement, null sinon'),
})
export type SessionInput = z.infer<typeof SessionSchema>
export type Session = SessionInput & { id: string }

// --- Plan stocké ---

export interface Week {
  number: number
  start: string
  end: string
  phase: Phase
  focus: string
  targetKm: number
  longRunKm: number
  sessions: Session[]
}

export interface Plan {
  id: string
  createdAt: string
  name: string
  overview: string
  /** Conseils de gestion de course (parcours, segments) */
  raceStrategy?: string
  startDate: string
  raceDate: string
  weeks: Week[]
}

// --- Objectif et profil ---

export const DISTANCES = { '5k': '5 km', '10k': '10 km', half: 'Half marathon', marathon: 'Marathon', trail: 'Trail' } as const
/** Libellés français, réservés aux prompts envoyés à Claude. */
export const DISTANCES_FR: Record<keyof typeof DISTANCES, string> = { '5k': '5 km', '10k': '10 km', half: 'Semi-marathon', marathon: 'Marathon', trail: 'Trail' }
export type GoalDistance = keyof typeof DISTANCES

export const TERRAINS = { road: 'Road', mixed: 'Mixed', trail: 'Trail / mountain' } as const
/** Libellés français, réservés aux prompts envoyés à Claude. */
export const TERRAINS_FR: Record<keyof typeof TERRAINS, string> = { road: 'Route', mixed: 'Mixte', trail: 'Sentiers / montagne' }
export type Terrain = keyof typeof TERRAINS

export interface Goal {
  distance: GoalDistance
  /** Distance réelle du parcours (trail, ou lue dans le GPX) */
  courseKm: number | null
  elevationGain: number | null
  terrain: Terrain
  /** Profil analysé depuis un GPX */
  course: CourseProfile | null
  /** Volume actuel (km/semaine) : point de départ du plan */
  currentWeeklyKm: number | null
  raceDate: string
  targetTime: number | null
  level: 'beginner' | 'intermediate' | 'advanced'
  /** Jours disponibles, 0 = lundi … 6 = dimanche */
  days: number[]
  longRunDay: number
  strength: boolean
}

export const ProfileSchema = z.object({
  thresholdPace: z.number().int().nullable().describe('allure seuil lactique en secondes/km'),
  lthr: z.number().int().nullable().describe('FC au seuil lactique en bpm'),
  maxHr: z.number().int().nullable(),
  restingHr: z.number().int().nullable(),
  vo2max: z.number().nullable(),
  predictions: z.object({
    fiveK: z.number().int().nullable().describe('secondes'),
    tenK: z.number().int().nullable(),
    half: z.number().int().nullable(),
    marathon: z.number().int().nullable(),
  }),
  weeklyKm: z.number().nullable().describe('volume course moyen par semaine sur les 4 dernières semaines'),
  longestRunKm: z.number().nullable().describe('plus longue sortie des 8 dernières semaines'),
  runsPerWeek: z.number().nullable(),
  notes: z.string().describe('2 à 4 phrases sur la forme actuelle, la charge et la récupération'),
})
export type Profile = z.infer<typeof ProfileSchema>

export interface Zone {
  zone: number
  name: string
  paceFast: number
  paceSlow: number
}

// --- Sorties attendues de Claude ---

export const SkeletonSchema = z.object({
  planName: z.string().describe('nom du plan, 60 caractères max'),
  overview: z.string().describe('présentation du plan, 600 caractères max'),
  raceStrategy: z.string().describe('stratégie de course : gestion de l’allure selon le parcours et ses segments, 3 à 6 phrases'),
  weeks: z.array(
    z.object({
      number: z.number().int(),
      phase: z.enum(PHASES),
      focus: z.string().describe('objectif de la semaine en une phrase'),
      targetKm: z.number().describe('volume course visé'),
      longRunKm: z.number().describe('distance de la sortie longue, 0 si aucune'),
    }),
  ),
})
export type Skeleton = z.infer<typeof SkeletonSchema>

export const WeeksSessionsSchema = z.object({
  weeks: z.array(z.object({ number: z.number().int(), sessions: z.array(SessionSchema) })),
})

export const AdjustmentSchema = z.object({
  summary: z.string().describe('bilan des 7 derniers jours (prévu vs réalisé, splits, fatigue) et raison des changements, 3 à 5 phrases'),
  newThresholdPace: z
    .number()
    .int()
    .nullable()
    .describe('nouvelle allure seuil en s/km si les résultats (splits des séances de qualité) montrent une progression ou une régression nette, sinon null'),
  changes: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD, une date de la semaine en cours à partir d’aujourd’hui'),
      action: z.enum(['replace', 'remove', 'add']),
      reason: z.string(),
      session: SessionSchema.nullable().describe('nouvelle séance pour replace/add, null pour remove'),
    }),
  ),
})
export type Adjustment = z.infer<typeof AdjustmentSchema>
