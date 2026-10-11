import type { Block, Session, Step, Zone } from './schema'

function stepPace(step: Step, zones: Zone[]) {
  if (step.paceFast && step.paceSlow) return (step.paceFast + step.paceSlow) / 2
  const z = zones.find((x) => x.zone === step.zone) ?? zones[1]
  return (z.paceFast + z.paceSlow) / 2
}

export interface FlatStep extends Step {
  seconds: number
  meters: number
  /** « 3/6 » pour une répétition */
  rep?: string
}

/** Étapes à plat (répétitions déroulées) avec durée et distance estimées. */
export function flatten(blocks: Block[], zones: Zone[]): FlatStep[] {
  const out: FlatStep[] = []
  const push = (s: Step, rep?: string) => {
    const pace = stepPace(s, zones)
    const seconds = s.target === 'time' ? s.value : (s.value / 1000) * pace
    const meters = s.target === 'distance' ? s.value : (s.value / pace) * 1000
    out.push({ ...s, seconds, meters, rep })
  }
  for (const b of blocks) {
    if (b.kind === 'repeat') {
      for (let i = 0; i < b.repeats; i++) b.steps.forEach((s) => push(s, `${i + 1}/${b.repeats}`))
    } else push(b)
  }
  return out
}

export function sessionTotals(session: Session, zones: Zone[]) {
  if (session.type === 'strength') return { seconds: (session.strengthMinutes ?? 30) * 60, meters: 0 }
  const steps = flatten(session.blocks, zones)
  return {
    seconds: steps.reduce((a, s) => a + s.seconds, 0),
    meters: steps.reduce((a, s) => a + s.meters, 0),
  }
}

export function weekMeters(sessions: Session[], zones: Zone[]) {
  return sessions.reduce((a, s) => a + sessionTotals(s, zones).meters, 0)
}

export function isRun(session: Session) {
  return session.type !== 'strength'
}
