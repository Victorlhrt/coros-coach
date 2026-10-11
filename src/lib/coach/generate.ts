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
  type SessionInput,
  type Week,
  type Zone,
} from './schema'
import { validateSessions } from './validate'

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

/** Dates disponibles d'une semaine selon les jours choisis. */
function availableDates(slot: WeekSlot, goal: Goal) {
  const dates: string[] = []
  for (let d = slot.start; d <= slot.end; d = addDays(d, 1)) {
    if (goal.days.includes(weekday(d)) && d <= goal.raceDate) dates.push(d)
  }
  if (goal.raceDate >= slot.start && goal.raceDate <= slot.end && !dates.includes(goal.raceDate)) dates.push(goal.raceDate)
  return dates.sort()
}

export async function generatePlan(
  goal: Goal,
  profile: Profile | null,
  zones: Zone[],
  onProgress: (p: Progress) => void,
): Promise<Plan> {
  const { start, weeks: slots, error } = planWeeks(goal.raceDate)
  if (error) throw new Error(error)
  const chunks = Math.ceil(slots.length / CHUNK)
  const total = chunks + 1
  const context = `${describeGoal(goal)}\n\n${describeProfile(profile)}\n\nZones d’allure :\n${describeZones(zones)}`

  onProgress({ step: 'Structure du plan', done: 0, total })
  const skeleton = await callStructured({
    system: COACH_SYSTEM,
    prompt: `${context}

Le plan compte ${slots.length} semaines (lundi-dimanche), du ${start} à la semaine de course :
${slots.map((s) => `Semaine ${s.number} : ${s.start} → ${s.end}`).join('\n')}

Conçois la structure : phase, objectif, volume et sortie longue pour chaque semaine. La dernière semaine contient la course.`,
    schema: SkeletonSchema,
    maxTokens: 6000,
    validate: (s) => {
      const errors: string[] = []
      if (s.weeks.length !== slots.length) errors.push(`Il faut exactement ${slots.length} semaines (reçu ${s.weeks.length}).`)
      s.weeks.forEach((w, i) => {
        if (w.number !== i + 1) errors.push(`Les semaines doivent être numérotées de 1 à ${slots.length} dans l’ordre.`)
      })
      if (s.planName.length > 60) errors.push('planName : 60 caractères maximum.')
      if (s.overview.length > 700) errors.push('overview : 700 caractères maximum.')
      return errors
    },
  })

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

  for (let c = 0; c < chunks; c++) {
    const part = weeks.slice(c * CHUNK, (c + 1) * CHUNK)
    onProgress({ step: `Semaines ${part[0].number} à ${part[part.length - 1].number}`, done: c + 1, total })
    const allowed = new Map(part.map((w) => [w.number, availableDates(w, goal)]))
    const previous = c > 0 ? weeks[c * CHUNK - 1] : null

    const result = await callStructured({
      system: COACH_SYSTEM,
      prompt: `${context}

Structure du plan :
${outline}
${previous ? `\nSemaine précédente déjà écrite (${previous.number}) : ${previous.sessions.map((s) => `${s.date} ${s.type} « ${s.title} »`).join(' ; ')}\n` : ''}
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
          else errors.push(...validateSessions(got.sessions, new Set(allowed.get(w.number)), `Semaine ${w.number}`))
        }
        return errors
      },
    })

    for (const w of part) {
      const got = result.weeks.find((x) => x.number === w.number)!
      w.sessions = withIds(got.sessions)
    }
  }

  onProgress({ step: 'Terminé', done: total, total })
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: skeleton.planName.slice(0, 60),
    overview: skeleton.overview,
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
