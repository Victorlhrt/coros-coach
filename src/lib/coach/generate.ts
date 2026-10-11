import { callStructured } from './claude'
import { WEEKDAYS, addDays, diffDays, planWeeks, today, weekday, type WeekSlot } from './dates'
import { COACH_SYSTEM, describeGoal, describeProfile, describeZones } from './prompts'
import {
  ProfileSchema,
  SkeletonSchema,
  WeeksSessionsSchema,
  type Goal,
  type Plan,
  type Profile,
  type Session,
  type Skeleton,
  type SessionInput,
  type Week,
  type Zone,
} from './schema'
import { validateSessions } from './validate'
import { sessionTotals } from './metrics'
import type { RaceRecord } from './vdot'

/** Profil coureur extrait des réponses brutes de COROS (formats non documentés → on laisse Claude lire). */
export async function extractProfile(raw: Record<string, unknown>): Promise<Profile> {
  const dump = Object.entries(raw)
    .map(([tool, value]) => `### ${tool}\n${JSON.stringify(value).slice(0, 15000)}`)
    .join('\n\n')
  return callStructured({
    system:
      'Tu extrais des données d’entraînement depuis des réponses brutes de l’API COROS. N’invente rien : null si une valeur est absente. Allures en secondes par km, temps en secondes.',
    prompt: `Date du jour : ${today()}.\n\n${dump}\n\nExtrait le profil du coureur.`,
    schema: ProfileSchema,
    maxTokens: 2000,
  })
}

export type Progress = { step: string; done: number; total: number }

const CHUNK = 4

/** Génération en cours, sauvegardée à chaque étape pour reprendre après un rechargement. */
export interface PlanDraft {
  goal: Goal
  skeleton: Skeleton | null
  /** Séances déjà écrites, par numéro de semaine. */
  sessions: Record<number, SessionInput[]>
}

const DRAFT_KEY = 'coach.planDraft'

export function loadDraft(): PlanDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as PlanDraft) : null
  } catch {
    return null
  }
}

function saveDraft(draft: PlanDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Stockage indisponible : la génération continue, sans reprise possible.
  }
}

let running = false
/** Vrai tant qu'une génération tourne dans cet onglet (évite d'en relancer une en revenant sur l'écran). */
export const isGenerating = () => running

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Rien à nettoyer.
  }
}

/** Dates disponibles d'une semaine selon les jours choisis. */
function availableDates(slot: WeekSlot, goal: Goal) {
  const dates: string[] = []
  for (let d = slot.start; d <= slot.end; d = addDays(d, 1)) {
    if (goal.days.includes(weekday(d)) && d <= goal.raceDate) dates.push(d)
  }
  if (goal.raceDate >= slot.start && goal.raceDate <= slot.end && !dates.includes(goal.raceDate)) dates.push(goal.raceDate)
  return dates.sort()
}

/**
 * Structure du plan, puis séances par blocs de 4 semaines écrits en parallèle.
 * Chaque étape terminée est sauvegardée : avec `resume`, seules les étapes manquantes sont relancées.
 */
export async function generatePlan(
  goal: Goal,
  profile: Profile | null,
  zones: Zone[],
  onProgress: (p: Progress) => void,
  records: RaceRecord[] = [],
  resume: PlanDraft | null = null,
): Promise<Plan> {
  running = true
  try {
    return await buildPlan(goal, profile, zones, onProgress, records, resume)
  } finally {
    running = false
  }
}

async function buildPlan(
  goal: Goal,
  profile: Profile | null,
  zones: Zone[],
  onProgress: (p: Progress) => void,
  records: RaceRecord[],
  resume: PlanDraft | null,
): Promise<Plan> {
  const { start, weeks: slots, error } = planWeeks(goal.raceDate)
  if (error) throw new Error(error)
  const chunks = Math.ceil(slots.length / CHUNK)
  const total = chunks + 1
  const context = `${describeGoal(goal)}\n\n${describeProfile(profile, records)}\n\nZones d’allure :\n${describeZones(zones)}`
  const draft: PlanDraft = resume ?? { goal, skeleton: null, sessions: {} }
  saveDraft(draft)

  onProgress({ step: 'Structure du plan', done: 0, total })
  const skeleton =
    draft.skeleton ??
    (await callStructured({
      system: COACH_SYSTEM,
      prompt: `${context}

Le plan compte ${slots.length} semaines (lundi-dimanche), du ${start} à la semaine de course :
${slots.map((s) => `Semaine ${s.number} : ${s.start} → ${s.end}`).join('\n')}

Conçois la structure : phase, objectif, volume et sortie longue pour chaque semaine. La dernière semaine contient la course.
Rédige aussi la stratégie de course (raceStrategy) en t’appuyant sur le parcours : où gérer, où relancer, allure cible par portion.`,
      schema: SkeletonSchema,
      maxTokens: 8000,
      validate: (s) => {
        const errors: string[] = []
        if (s.weeks.length !== slots.length) errors.push(`Il faut exactement ${slots.length} semaines (reçu ${s.weeks.length}).`)
        s.weeks.forEach((w, i) => {
          if (w.number !== i + 1) errors.push(`Les semaines doivent être numérotées de 1 à ${slots.length} dans l’ordre.`)
        })
        if (s.planName.length > 60) errors.push('planName : 60 caractères maximum.')
        if (s.overview.length > 700) errors.push('overview : 700 caractères maximum.')
        errors.push(...checkVolumes(s.weeks, goal.currentWeeklyKm))
        return errors
      },
    }))
  draft.skeleton = skeleton
  saveDraft(draft)

  const weeks: Week[] = slots.map((slot, i) => ({
    ...slot,
    phase: skeleton.weeks[i].phase,
    focus: skeleton.weeks[i].focus,
    targetKm: skeleton.weeks[i].targetKm,
    longRunKm: skeleton.weeks[i].longRunKm,
    sessions: [],
  }))
  const outline = weeks
    .map((w) => `Semaine ${w.number} (${w.start} → ${w.end}) : ${w.phase}, ${w.targetKm} km, sortie longue ${w.longRunKm} km — ${w.focus}`)
    .join('\n')

  const parts = Array.from({ length: chunks }, (_, c) => weeks.slice(c * CHUNK, (c + 1) * CHUNK))
  const isDone = (part: Week[]) => part.every((w) => draft.sessions[w.number])
  let done = 1 + parts.filter(isDone).length
  const report = () => onProgress({ step: done < total ? `Séances, bloc ${done} sur ${chunks}` : 'Finalisation', done, total })
  report()

  await Promise.all(
    parts.map(async (part) => {
      if (isDone(part)) return
      const allowed = new Map(part.map((w) => [w.number, availableDates(w, goal)]))
      const result = await callStructured({
        system: COACH_SYSTEM,
        prompt: `${context}

Structure du plan :
${outline}

Les autres semaines sont écrites en parallèle selon cette même structure : respecte-la pour que l’enchaînement reste cohérent.
Écris maintenant toutes les séances des semaines ${part.map((w) => w.number).join(', ')}.
Dates autorisées (et seulement celles-ci) :
${part.map((w) => `Semaine ${w.number} : ${allowed.get(w.number)!.map((d) => `${d} (${WEEKDAYS[weekday(d)]})`).join(', ')}`).join('\n')}
${goal.raceDate <= part[part.length - 1].end ? `La course a lieu le ${goal.raceDate} : séance de type race ce jour-là, avec l’allure objectif.` : ''}
Tu n’es pas obligé d’utiliser toutes les dates : adapte le nombre de séances au volume visé.`,
        schema: WeeksSessionsSchema,
        validate: (r) => {
          const errors: string[] = []
          for (const w of part) {
            const got = r.weeks.find((x) => x.number === w.number)
            if (!got) errors.push(`Semaine ${w.number} manquante.`)
            else {
              errors.push(...validateSessions(got.sessions, new Set(allowed.get(w.number)), `Semaine ${w.number}`))
              errors.push(...checkWeekTotals(w, got.sessions, zones))
            }
          }
          return errors
        },
      })
      for (const w of part) draft.sessions[w.number] = result.weeks.find((x) => x.number === w.number)!.sessions
      saveDraft(draft)
      done++
      report()
    }),
  )

  for (const w of weeks) w.sessions = withIds(draft.sessions[w.number])
  onProgress({ step: 'Terminé', done: total, total })
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: skeleton.planName.slice(0, 60),
    overview: skeleton.overview,
    raceStrategy: skeleton.raceStrategy,
    startDate: start,
    raceDate: goal.raceDate,
    weeks,
  }
}

export function withIds(sessions: SessionInput[]): Session[] {
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ ...s, id: crypto.randomUUID() }))
}

export function planDayNo(plan: Plan, date: string) {
  return diffDays(plan.startDate, date)
}

/** Progression du volume : départ proche du volume actuel, hausse limitée d'une semaine à l'autre. */
export function checkVolumes(weeks: Skeleton['weeks'], current: number | null) {
  const errors: string[] = []
  const first = weeks[0]
  if (current && first) {
    if (first.targetKm < current * 0.85) {
      errors.push(`Semaine 1 : ${first.targetKm} km est trop bas, le coureur fait déjà ${current} km/semaine. Vise au moins ${Math.round(current * 0.9)} km.`)
    }
    if (first.targetKm > current * 1.15) {
      errors.push(`Semaine 1 : ${first.targetKm} km est trop haut pour un volume actuel de ${current} km. Vise au plus ${Math.round(current * 1.1)} km.`)
    }
  }
  let peak = current ?? first?.targetKm ?? 0
  for (const w of weeks.slice(1)) {
    if (w.phase !== 'taper' && w.phase !== 'race' && w.targetKm > peak * 1.12 + 2) {
      errors.push(`Semaine ${w.number} : ${w.targetKm} km dépasse +10 % par rapport au plus haut volume précédent (${Math.round(peak)} km).`)
    }
    peak = Math.max(peak, w.targetKm)
  }
  return errors
}

/** Les séances d'une semaine doivent correspondre au volume prévu par la structure (±15 %). */
export function checkWeekTotals(week: Week, sessions: SessionInput[], zones: Zone[]) {
  if (!week.targetKm) return []
  const km = sessions.reduce((a, s) => a + sessionTotals({ ...s, id: '' }, zones).meters, 0) / 1000
  const errors: string[] = []
  if (km < week.targetKm * 0.85 || km > week.targetKm * 1.15) {
    errors.push(
      `Semaine ${week.number} : les séances totalisent ${km.toFixed(1)} km (estimés avec les zones d’allure) au lieu de ${week.targetKm} km visés. Ajuste les durées/distances pour être à ±10 %.`,
    )
  }
  if (week.longRunKm > 0) {
    const longest = Math.max(0, ...sessions.filter((s) => s.type === 'long' || s.type === 'race').map((s) => sessionTotals({ ...s, id: '' }, zones).meters / 1000))
    if (longest < week.longRunKm * 0.8) errors.push(`Semaine ${week.number} : la sortie longue fait ${longest.toFixed(1)} km au lieu de ${week.longRunKm} km.`)
  }
  return errors
}
