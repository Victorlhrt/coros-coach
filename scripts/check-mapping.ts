// Vérifie hors ligne qu'un plan type produit un payload createTrainingPlan conforme aux règles COROS.
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { addDays, planWeeks, today } from '../src/lib/coach/dates'
import { AdjustmentSchema, ProfileSchema, SkeletonSchema, WeeksSessionsSchema, type Plan } from '../src/lib/coach/schema'
import { createPlanArgs, updateDaysArgs } from '../src/lib/coros/mapping'

const { start, weeks } = planWeeks(addDays(today(), 60))
const plan: Plan = {
  id: 'x', createdAt: '', name: 'Plan 10 km', overview: 'Test', startDate: start, raceDate: addDays(today(), 60),
  weeks: weeks.map((w, i) => ({
    ...w, phase: i < 4 ? 'base' : i < weeks.length - 1 ? 'build' : 'taper', focus: '', targetKm: 30, longRunKm: 10,
    sessions: [
      { id: `a${i}`, date: w.end, type: 'long', title: 'Sortie longue', description: 'Facile', strengthMinutes: null,
        blocks: [{ kind: 'work', target: 'distance', value: 12000, zone: 2, paceFast: null, paceSlow: null }] },
      { id: `b${i}`, date: addDays(w.end, -4), type: 'interval', title: '6 × 800 m', description: 'VMA', strengthMinutes: null,
        blocks: [
          { kind: 'warmup', target: 'time', value: 900, zone: 1, paceFast: null, paceSlow: null },
          { kind: 'repeat', repeats: 6, steps: [
            { kind: 'work', target: 'distance', value: 800, zone: 5, paceFast: 225, paceSlow: 235 },
            { kind: 'recovery', target: 'time', value: 120, zone: 1, paceFast: null, paceSlow: null } ] },
          { kind: 'cooldown', target: 'time', value: 600, zone: 1, paceFast: null, paceSlow: null } ] },
      { id: `c${i}`, date: addDays(w.end, -3), type: 'strength', title: 'Renfo', description: 'Gainage', strengthMinutes: 25, blocks: [] },
    ].filter((s) => s.date >= w.start),
  })),
}

const args = createPlanArgs(plan)
const errors: string[] = []
const lastDayNo = weeks.length * 7 - ((new Date(start).getDay() + 6) % 7) - 1
for (const c of args.courseList) {
  if (c.dayNo < 0 || c.dayNo > lastDayNo) errors.push(`dayNo ${c.dayNo} hors [0, ${lastDayNo}]`)
  if (c.sportType !== 1) errors.push('sportType')
}
const p = args.phaseInfo.periodization
if (p.reduce((a, x) => a + x.durationWeeks, 0) !== args.planInfo.totalWeeks) errors.push('somme des phases ≠ totalWeeks')
if (String(p[0].startDate) !== start.replaceAll('-', '')) errors.push('la 1re phase doit commencer au début du plan')
if (args.courseList.some((c) => c.courseName === 'Renfo')) errors.push('le renfo ne doit pas partir sur COROS')
console.log('semaines', args.planInfo.totalWeeks, 'séances', args.courseList.length, 'phases', JSON.stringify(p))
console.log('exemple', JSON.stringify(args.courseList[1]))
console.log('update', JSON.stringify(updateDaysArgs(plan, '123', [addDays(start, 1)]).courseList))
for (const s of [SkeletonSchema, WeeksSessionsSchema, ProfileSchema, AdjustmentSchema]) {
  const f = zodOutputFormat(s) as { schema?: unknown }
  if (!f.schema) errors.push('schéma de sortie vide')
}
console.log(errors.length ? `ÉCHEC\n${errors.join('\n')}` : 'OK')
