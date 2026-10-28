import { diffDays, toCoros } from '@/lib/coach/dates'
import type { Block, Phase, Plan, Session, Step } from '@/lib/coach/schema'

const SECTION_TYPE = { warmup: 1, work: 2, recovery: 3, cooldown: 4 } as const

/** Une étape → section COROS : allure absolue si fournie, sinon zone FC (relative à la FC seuil COROS). */
function section(step: Step, inSet = false) {
  const sectionType = inSet && (step.kind === 'warmup' || step.kind === 'cooldown') ? 2 : SECTION_TYPE[step.kind]
  const base = { sectionType, targetType: step.target === 'distance' ? 1 : 2, targetValue: Math.round(step.value) }
  if (step.paceFast && step.paceSlow) {
    return { ...base, intensityType: 2, intensityValueStart: step.paceFast, intensityValueEnd: step.paceSlow }
  }
  return { ...base, intensityType: 1, sectionIntensity: Math.min(6, Math.max(1, step.zone)) }
}

function sections(blocks: Block[]) {
  return blocks.map((b) =>
    b.kind === 'repeat'
      ? { intervalGroup: true, repeats: Math.min(20, Math.max(1, b.repeats)), sets: b.steps.map((s) => section(s, true)) }
      : section(b),
  )
}

/** Le renforcement n'est pas pris en charge par le MCP COROS : il reste dans l'app. */
export function isPushable(session: Session) {
  return session.type !== 'strength'
}

export function toCourse(session: Session) {
  return {
    sportType: 1,
    courseName: session.title.slice(0, 100),
    courseDescription: session.description || session.title,
    sections: sections(session.blocks),
  }
}

/** Courses COROS d'un jour du plan (vide = jour de repos). */
export function dayCourses(plan: Plan, date: string) {
  return plan.weeks
    .flatMap((w) => w.sessions)
    .filter((s) => s.date === date && isPushable(s))
    .map((s) => ({ dayNo: diffDays(plan.startDate, date), ...toCourse(s) }))
}

/** Empreinte d'un jour : sert à savoir si ce qui est sur la montre est à jour. */
export function dayHash(plan: Plan, date: string) {
  return JSON.stringify(dayCourses(plan, date))
}

const PHASE_TYPE: Record<Phase, number> = { base: 2, build: 3, peak: 4, taper: 5, race: 5 }

/** Phases contiguës au format COROS : la première commence au début du plan, les suivantes un lundi. */
export function periodization(plan: Plan) {
  const out: { phaseType: number; startDate: number; endDate: number; durationWeeks: number }[] = []
  for (const w of plan.weeks) {
    const type = PHASE_TYPE[w.phase]
    const last = out[out.length - 1]
    if (last && last.phaseType === type) {
      last.endDate = Number(toCoros(w.end))
      last.durationWeeks++
    } else {
      out.push({ phaseType: type, startDate: Number(toCoros(w.start)), endDate: Number(toCoros(w.end)), durationWeeks: 1 })
    }
  }
  return out
}

export function createPlanArgs(plan: Plan) {
  const dates = [...new Set(plan.weeks.flatMap((w) => w.sessions.map((s) => s.date)))].sort()
  return {
    planInfo: {
      planName: plan.name.slice(0, 60),
      planOverview: plan.overview.slice(0, 780),
      planStartDate: Number(toCoros(plan.startDate)),
      totalWeeks: plan.weeks.length,
    },
    phaseInfo: { periodization: periodization(plan) },
    courseList: dates.flatMap((d) => dayCourses(plan, d)).filter((c) => c.dayNo >= 0),
  }
}

/** Mise à jour de jours précis : un jour sans séance est envoyé comme repos (vide le jour sur COROS). */
export function updateDaysArgs(plan: Plan, planId: string, dates: string[]) {
  const courseList = dates.flatMap((d) => {
    const courses = dayCourses(plan, d)
    return courses.length > 0
      ? courses
      : [{ dayNo: diffDays(plan.startDate, d), sportType: 4, courseName: 'Rest', courseDescription: 'Recovery day', sections: [] }]
  })
  return { planInfo: { planId }, courseList }
}
