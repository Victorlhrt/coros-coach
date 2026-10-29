// Vérifie hors ligne les garde-fous du bilan hebdomadaire (tendance sur 3 semaines, plancher de volume, allure seuil).
import { checkAdjustment, trainingTrend } from '../src/lib/coach/guardrails'
import type { Adjustment, Plan, Session } from '../src/lib/coach/schema'
import { zonesFromThreshold } from '../src/lib/coach/zones'

const zones = zonesFromThreshold(300)
const run = (id: string, date: string, km = 10): Session => ({
  id, date, type: 'easy', title: 'Easy', description: '', strengthMinutes: null,
  blocks: [{ kind: 'work', target: 'distance', value: km * 1000, zone: 2, paceFast: null, paceSlow: null }],
})
const week = (n: number, start: string, end: string, days: string[]) => ({
  number: n, start, end, phase: 'build' as const, focus: '', targetKm: 30, longRunKm: 10, sessions: days.map((d, i) => run(`w${n}s${i}`, d)),
})
const plan: Plan = {
  id: 'p', createdAt: '', name: '', overview: '', startDate: '2026-10-05', raceDate: '2026-12-20',
  weeks: [
    week(1, '2026-10-05', '2026-10-11', ['2026-10-06', '2026-10-08', '2026-10-10']),
    week(2, '2026-10-12', '2026-10-18', ['2026-10-13', '2026-10-15', '2026-10-17']),
    week(3, '2026-10-19', '2026-10-25', ['2026-10-20', '2026-10-22', '2026-10-24']),
    week(4, '2026-10-26', '2026-11-01', ['2026-10-28', '2026-10-30', '2026-11-01']),
  ],
}
const now = '2026-10-27'
const errors: string[] = []
const expect = (ok: boolean, msg: string) => ok || errors.push(msg)
const linked = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { labelId: id }]))

// Une seule mauvaise semaine : pas de tendance, le volume restant ne peut pas fondre.
const oneBad = trainingTrend(plan, linked(['w1s0', 'w1s1', 'w1s2', 'w2s0', 'w2s1', 'w2s2']), {}, {}, zones, now)
expect(oneBad.completion.join() === '1,1,0', `réalisation par semaine (${oneBad.completion})`)
expect(!oneBad.struggling, 'une mauvaise semaine n’est pas une tendance')
const remaining = plan.weeks[3].sessions
const cut: Adjustment = { summary: '', newThresholdPace: null, changes: remaining.slice(0, 2).map((s) => ({ date: s.date, action: 'remove' as const, reason: '', session: null })) }
expect(checkAdjustment(cut, oneBad, remaining, zones).length === 1, 'baisse de 66 % refusée sans tendance')
const light: Adjustment = { ...cut, changes: [{ date: remaining[0].date, action: 'replace', reason: '', session: { ...run('x', remaining[0].date, 8) } }] }
expect(checkAdjustment(light, oneBad, remaining, zones).length === 0, 'séance raccourcie de 2 km acceptée')
expect(checkAdjustment({ ...light, newThresholdPace: 306 }, oneBad, remaining, zones).length === 1, 'seuil plus lent refusé sans tendance')

// Trois semaines sous 70 % : tendance confirmée, on peut alléger et ralentir le seuil de 3 % au plus.
const bad = trainingTrend(plan, linked(['w1s0', 'w2s0', 'w3s0']), {}, {}, zones, now)
expect(bad.struggling, 'trois semaines à 33 % : tendance')
expect(checkAdjustment(cut, bad, remaining, zones).length === 0, 'baisse acceptée avec tendance')
expect(checkAdjustment({ ...light, newThresholdPace: 306 }, bad, remaining, zones).length === 0, 'seuil +2 % accepté avec tendance')
expect(checkAdjustment({ ...light, newThresholdPace: 320 }, bad, remaining, zones).length === 1, 'seuil +6,7 % refusé')

// Douleur : la santé passe avant le plancher.
const pain = trainingTrend(plan, linked([]), { w4s0: { rating: 2, rpe: 6, tags: ['Douleur'], comment: '', at: '' }, w3s2: { rating: 2, rpe: 6, tags: ['Douleur'], comment: '', at: '' } }, {}, zones, now)
expect(pain.pain, 'douleur de la semaine détectée')
expect(checkAdjustment(cut, pain, remaining, zones).length === 0, 'baisse acceptée en cas de douleur')

// Seuil modifié il y a moins de 2 semaines : gelé.
const frozen = trainingTrend(plan, linked([]), {}, { 3: { createdAt: '2026-10-20T08:00:00Z', status: 'applied', adjustment: { summary: '', newThresholdPace: 295, changes: [] } } }, zones, now)
expect(frozen.thresholdFrozen, 'seuil gelé 14 jours')
expect(checkAdjustment({ ...light, newThresholdPace: 297 }, frozen, remaining, zones).length === 1, 'changement de seuil refusé pendant le gel')

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'))
  process.exit(1)
}
console.log('check-guardrails : ok')
