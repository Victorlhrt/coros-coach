// Tests hors ligne des règles du coach : volume, liaison automatique, records.
import './node-env'
import { addDays, today } from '../src/lib/coach/dates'
import { checkVolumes, checkWeekTotals } from '../src/lib/coach/generate'
import { autoLinks } from '../src/lib/coach/links'
import { mergeRecords } from '../src/lib/coach/records'
import type { Plan, Week } from '../src/lib/coach/schema'
import { computeVolume } from '../src/lib/coach/volume'
import { zonesFromThreshold } from '../src/lib/coach/zones'

const fails: string[] = []
const expect = (cond: boolean, label: string) => (cond ? console.log('✓', label) : fails.push(label))
const zones = zonesFromThreshold(270)
const wk = (number: number, targetKm: number, phase: Week['phase'] = 'base') => ({ number, phase, focus: '', targetKm, longRunKm: 0 })

// Le cas signalé : 32 km/semaine actuels, plan à 20 km → refusé.
expect(checkVolumes([wk(1, 20), wk(2, 22)], 32).some((e) => e.includes('trop bas')), 'semaine 1 trop basse refusée')
expect(checkVolumes([wk(1, 31), wk(2, 34), wk(3, 36), wk(4, 28)], 32).length === 0, 'progression raisonnable acceptée')
expect(checkVolumes([wk(1, 32), wk(2, 45)], 32).some((e) => e.includes('+10 %')), 'saut de volume refusé')
expect(checkVolumes([wk(1, 32), wk(2, 35), wk(3, 20, 'taper')], 32).length === 0, 'affûtage autorisé à baisser')

const week: Week = { number: 1, start: today(), end: addDays(today(), 6), phase: 'base', focus: '', targetKm: 30, longRunKm: 12, sessions: [] }
const run = (date: string, km: number, type: 'easy' | 'long' = 'easy') => ({
  date, type, title: 't', description: 'd', strengthMinutes: null,
  blocks: [{ kind: 'work' as const, target: 'distance' as const, value: km * 1000, zone: 2, paceFast: null, paceSlow: null }],
})
expect(checkWeekTotals(week, [run(today(), 6), run(addDays(today(), 2), 6)], zones).some((e) => e.includes('totalisent')), 'séances sous le volume visé refusées')
expect(checkWeekTotals(week, [run(today(), 8), run(addDays(today(), 2), 9), run(addDays(today(), 5), 13, 'long')], zones).length === 0, 'semaine au bon volume acceptée')

// Volume réel : 4 semaines à 8 + 10 + 14 km.
const acts = [7, 14, 21, 28].flatMap((d) => [
  { labelId: `a${d}`, sportType: 100, date: addDays(today(), -d), name: 'run', meters: 8000, seconds: 2400, paceSecPerKm: 300 },
  { labelId: `b${d}`, sportType: 100, date: addDays(today(), -d + 2), name: 'run', meters: 10000, seconds: 3000, paceSecPerKm: 300 },
  { labelId: `c${d}`, sportType: 100, date: addDays(today(), -d + 4), name: 'run', meters: 14000, seconds: 4300, paceSecPerKm: 307 },
])
const v = computeVolume(acts)
console.log('volume', v.avg4w, v.weeks.map((w) => w.km))
expect(v.avg4w > 25 && v.avg4w <= 32, 'volume moyen calculé depuis les activités')

// Liaison auto : même jour, distance la plus proche ; un lien manuel n'est jamais écrasé.
const d = addDays(today(), -1)
const plan = { weeks: [{ sessions: [{ ...run(d, 10), id: 's1' }, { ...run(addDays(today(), -2), 8), id: 's2' }] }] } as unknown as Plan
const activities = [
  { labelId: 'x', sportType: 100, date: d, name: 'run', meters: 3000, seconds: 900, paceSecPerKm: 300 },
  { labelId: 'y', sportType: 100, date: d, name: 'run', meters: 10200, seconds: 3000, paceSecPerKm: 294 },
  { labelId: 'z', sportType: 100, date: addDays(today(), -2), name: 'run', meters: 8000, seconds: 2500, paceSecPerKm: 312 },
]
const links = autoLinks(plan, activities, { s2: { labelId: null, sportType: 100, auto: false } }, zones)
expect(links.s1?.labelId === 'y', 'activité la plus proche liée')
expect(!('s2' in links), 'déliaison manuelle respectée')

const merged = mergeRecords(
  [{ key: '10k', seconds: 2500, date: null, source: 'manual' }, { key: '5k', seconds: 1300, date: '2025-01-01', source: 'coros' }],
  [{ key: '10k', seconds: 2400, date: '2026-09-01', source: 'coros' }, { key: '5k', seconds: 1320, date: '2026-08-01', source: 'coros' }],
)
expect(merged.find((r) => r.key === '10k')?.source === 'manual', 'record saisi conservé')
expect(merged.find((r) => r.key === '5k')?.seconds === 1320, 'record COROS remplacé par la fenêtre de 12 mois')

console.log(fails.length ? `ÉCHEC :\n${fails.join('\n')}` : 'OK')
