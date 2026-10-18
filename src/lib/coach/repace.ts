import type { Block, Goal, Plan, Session, Zone } from './schema'

const GOAL_KM: Partial<Record<Goal['distance'], number>> = { '5k': 5, '10k': 10, half: 21.0975, marathon: 42.195 }

/** Allure objectif (s/km) tirée du temps visé, ou null sans temps ou distance connus. */
export function goalPace(goal: Goal | null) {
  if (!goal?.targetTime) return null
  const km = goal.courseKm ?? goal.course?.distanceKm ?? GOAL_KM[goal.distance]
  return km ? goal.targetTime / km : null
}

/** Marge autour de l'allure objectif pour reconnaître un bloc « allure course » (s/km). */
const GOAL_MARGIN = 4

type Step = Extract<Block, { kind: 'warmup' | 'work' | 'recovery' | 'cooldown' }>

function repaceStep(step: Step, ratio: (zone: number) => number | null, goal: number | null): Step {
  if (step.paceFast === null || step.paceSlow === null) return step
  // Allure course : fixée par le temps visé, pas par la forme du moment.
  if (goal && step.paceFast - GOAL_MARGIN <= goal && goal <= step.paceSlow + GOAL_MARGIN) return step
  const r = ratio(step.zone)
  if (!r) return step
  return { ...step, paceFast: Math.round(step.paceFast * r), paceSlow: Math.round(step.paceSlow * r) }
}

function mapSteps(session: Session, fn: (step: Step) => Step): Session {
  const blocks = session.blocks.map((b) => (b.kind === 'repeat' ? { ...b, steps: b.steps.map(fn) } : fn(b)))
  return JSON.stringify(blocks) === JSON.stringify(session.blocks) ? session : { ...session, blocks }
}

/** Tolérance autour d'une zone pour juger une allure cible cohérente. */
const ZONE_MARGIN = 0.05

/**
 * Allure cible compatible avec la zone de l'étape (± 5 %), ou allure objectif posée sur une zone voisine.
 * Évite par exemple un effort « Z5 VMA » écrit à l'allure d'endurance.
 */
export function paceFitsZone(step: Pick<Step, 'zone' | 'paceFast' | 'paceSlow'>, zones: Zone[], goal: number | null) {
  if (step.paceFast === null || step.paceSlow === null) return true
  const mid = (step.paceFast + step.paceSlow) / 2
  const within = (n: number) => {
    const z = zones.find((x) => x.zone === n)
    return !z || (mid >= z.paceFast * (1 - ZONE_MARGIN) && mid <= z.paceSlow * (1 + ZONE_MARGIN))
  }
  if (within(step.zone)) return true
  const atGoal = goal !== null && step.paceFast - GOAL_MARGIN <= goal && goal <= step.paceSlow + GOAL_MARGIN
  return atGoal && (within(step.zone - 1) || within(step.zone + 1))
}

/**
 * Séances à venir (à partir de `from`) : une allure cible incohérente avec sa zone est remplacée par l'allure de la zone.
 * La course et les séances passées ne bougent pas.
 */
export function fixPaces(plan: Plan, zones: Zone[], goal: Goal | null, from: string) {
  const target = goalPace(goal)
  const fix = (step: Step): Step => {
    if (paceFitsZone(step, zones, target)) return step
    const z = zones.find((x) => x.zone === step.zone)
    return z ? { ...step, paceFast: z.paceFast, paceSlow: z.paceSlow } : step
  }
  return mapPlan(plan, from, (s) => mapSteps(s, fix))
}

function mapPlan(plan: Plan, from: string, fn: (session: Session) => Session) {
  const changed: string[] = []
  const weeks = plan.weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => {
      if (s.date < from || s.type === 'race' || s.type === 'strength') return s
      const next = fn(s)
      if (next !== s) changed.push(s.date)
      return next
    }),
  }))
  return { plan: changed.length ? { ...plan, weeks } : plan, changed }
}

/**
 * Nouvelles zones → allures cibles des séances à venir (à partir de `from`) mises à l'échelle de leur zone.
 * Les blocs à allure objectif, la course et les séances passées ne bougent pas.
 */
export function repacePlan(plan: Plan, before: Zone[], after: Zone[], goal: Goal | null, from: string) {
  const mid = (zones: Zone[], n: number) => {
    const z = zones.find((x) => x.zone === n)
    return z ? (z.paceFast + z.paceSlow) / 2 : null
  }
  const ratio = (n: number) => {
    const a = mid(before, n)
    const b = mid(after, n)
    return a && b && Math.abs(b / a - 1) >= 0.005 ? b / a : null
  }
  const target = goalPace(goal)
  return mapPlan(plan, from, (s) => mapSteps(s, (step) => repaceStep(step, ratio, target)))
}
