import { sessionTotals } from './metrics'
import type { Block, Plan, Session, Step, Zone } from './schema'

const km = (s: Session, zones: Zone[]) => sessionTotals(s, zones).meters / 1000

function scaleStep(step: Step, f: number): Step {
  const value = step.target === 'distance' ? Math.max(100, Math.round((step.value * f) / 100) * 100) : Math.max(30, Math.round((step.value * f) / 30) * 30)
  return { ...step, value }
}

/** Séance allongée ou raccourcie d'un facteur `f` (toutes les étapes, distances au 100 m, durées à 30 s). */
export function scaleSession(session: Session, f: number): Session {
  const blocks: Block[] = session.blocks.map((b) => (b.kind === 'repeat' ? { ...b, steps: b.steps.map((s) => scaleStep(s, f)) } : scaleStep(b, f)))
  return { ...session, blocks }
}

/**
 * Semaines à venir où un footing dépasse la sortie longue : le volume des footings restants est reporté
 * sur la sortie longue, qui redevient la plus longue sortie de la semaine. Le volume de la semaine ne change pas.
 * Les séances passées ou déjà réalisées (`done`), la qualité et la course ne bougent pas.
 */
export function fixLongRuns(plan: Plan, zones: Zone[], from: string, done: Set<string>) {
  const changed: string[] = []
  const weeks = plan.weeks.map((w) => {
    const long = w.sessions.find((s) => s.type === 'long')
    if (!long || long.date < from || done.has(long.id) || w.sessions.some((s) => s.type === 'race')) return w
    const others = w.sessions.filter((s) => s.type !== 'long' && s.type !== 'strength')
    const L = km(long, zones)
    if (!others.some((s) => km(s, zones) > L + 0.5)) return w

    const adjustable = others.filter((s) => (s.type === 'easy' || s.type === 'recovery') && s.date >= from && !done.has(s.id))
    if (!adjustable.length) return w
    const fixedMax = Math.max(0, ...others.filter((s) => !adjustable.includes(s)).map((s) => km(s, zones)))
    const easyKm = adjustable.reduce((a, s) => a + km(s, zones), 0)
    const pool = L + easyKm

    let target = Math.ceil(Math.max(L, fixedMax + 1, pool / (adjustable.length + 1) + 1))
    const maxEasy = Math.max(...adjustable.map((s) => km(s, zones)))
    while (target < pool && (maxEasy * (pool - target)) / easyKm > target) target++
    const rest = pool - target
    // Pas assez de volume pour garder des footings d'au moins 3 km : on laisse la semaine telle quelle.
    if (adjustable.some((s) => (km(s, zones) * rest) / easyKm < 3)) return w

    const sessions = w.sessions.map((s) => {
      if (s === long) return scaleSession(s, target / L)
      if (adjustable.includes(s)) return scaleSession(s, rest / easyKm)
      return s
    })
    changed.push(...[long, ...adjustable].map((s) => s.date))
    return { ...w, longRunKm: Math.max(w.longRunKm, target), sessions }
  })
  return { plan: changed.length ? { ...plan, weeks } : plan, changed }
}
