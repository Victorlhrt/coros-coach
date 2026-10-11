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

function repaceSession(session: Session, ratio: (zone: number) => number | null, goal: number | null): Session {
  const blocks = session.blocks.map((b) =>
    b.kind === 'repeat' ? { ...b, steps: b.steps.map((s) => repaceStep(s, ratio, goal)) } : repaceStep(b, ratio, goal),
  )
  return JSON.stringify(blocks) === JSON.stringify(session.blocks) ? session : { ...session, blocks }
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
  const changed: string[] = []
  const weeks = plan.weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => {
      if (s.date < from || s.type === 'race' || s.type === 'strength') return s
      const next = repaceSession(s, ratio, target)
      if (next !== s) changed.push(s.date)
      return next
    }),
  }))
  return { plan: changed.length ? { ...plan, weeks } : plan, changed }
}
