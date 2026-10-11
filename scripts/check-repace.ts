// Tests hors ligne du recalcul des allures quand l'allure seuil change.
import { addDays, today } from '../src/lib/coach/dates'
import { repacePlan } from '../src/lib/coach/repace'
import type { Goal, Plan, Session } from '../src/lib/coach/schema'
import { zonesFromThreshold } from '../src/lib/coach/zones'

const fails: string[] = []
const expect = (cond: boolean, label: string) => (cond ? console.log('✓', label) : fails.push(label))

const before = zonesFromThreshold(300)
const after = zonesFromThreshold(285)
// Semi en 1:35:00 → 270 s/km.
const goal = { distance: 'half', targetTime: 5700, courseKm: null, course: null } as unknown as Goal

const step = (zone: number, paceFast: number | null, paceSlow: number | null) =>
  ({ kind: 'work', target: 'distance', value: 1000, zone, paceFast, paceSlow }) as const
const session = (id: string, date: string, type: Session['type'], blocks: Session['blocks']): Session =>
  ({ id, date, type, title: id, description: '', strengthMinutes: null, blocks }) as Session

const past = addDays(today(), -2)
const next = addDays(today(), 2)
const plan = {
  weeks: [
    {
      number: 1, start: past, end: addDays(today(), 6), phase: 'build', focus: '', targetKm: 40, longRunKm: 16,
      sessions: [
        session('vma-passee', past, 'interval', [{ kind: 'repeat', repeats: 6, steps: [step(5, 280, 290), { ...step(1, null, null), kind: 'recovery' }] }]),
        session('vma', next, 'interval', [{ kind: 'repeat', repeats: 6, steps: [step(5, 280, 290), { ...step(1, null, null), kind: 'recovery' }] }]),
        session('longue-allure', addDays(next, 1), 'long', [step(2, null, null), step(3, 268, 272)]),
        session('course', addDays(next, 2), 'race', [step(3, 268, 272)]),
      ],
    },
  ],
} as unknown as Plan

const { plan: out, changed } = repacePlan(plan, before, after, goal, today())
const byId = Object.fromEntries(out.weeks[0].sessions.map((s) => [s.id, s]))
const vma = (byId.vma.blocks[0] as Extract<Session['blocks'][number], { kind: 'repeat' }>).steps[0]
expect(vma.paceFast === Math.round(280 * 0.95) && vma.paceSlow === Math.round(290 * 0.95), `VMA à venir plus rapide de 5 % (${vma.paceFast}-${vma.paceSlow})`)
expect(JSON.stringify(byId['vma-passee'].blocks) === JSON.stringify(plan.weeks[0].sessions[0].blocks), 'séance passée inchangée')
expect(JSON.stringify(byId['longue-allure'].blocks) === JSON.stringify(plan.weeks[0].sessions[2].blocks), 'bloc à allure objectif inchangé')
expect(JSON.stringify(byId.course.blocks) === JSON.stringify(plan.weeks[0].sessions[3].blocks), 'course inchangée')
expect(changed.length === 1 && changed[0] === next, `seule la séance VMA à venir est signalée (${changed.join(', ')})`)
expect(repacePlan(plan, before, before, goal, today()).changed.length === 0, 'mêmes zones : rien ne bouge')

if (fails.length) {
  console.error(fails.map((f) => `✗ ${f}`).join('\n'))
  process.exit(1)
}
console.log('OK')
