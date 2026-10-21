// Tests hors ligne des règles du coach : volume, liaison automatique, records.
import './node-env'
import { addDays, today } from '../src/lib/coach/dates'
import { checkLongRuns, checkVolumes, checkWeekTotals } from '../src/lib/coach/generate'
import { autoLinks } from '../src/lib/coach/links'
import { fixLongRuns } from '../src/lib/coach/longrun'
import { sessionTotals } from '../src/lib/coach/metrics'
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
// Le cas signalé : sortie longue du dimanche plus courte qu'un footing de semaine → refusé.
expect(checkWeekTotals(week, [run(today(), 8), run(addDays(today(), 2), 13), run(addDays(today(), 5), 10, 'long')], zones).some((e) => e.includes('plus longue que la sortie longue')), 'footing plus long que la sortie longue refusé')
expect(checkLongRuns([{ ...wk(1, 30), longRunKm: 6 }]).length === 1, 'sortie longue trop courte dans la structure refusée')
expect(checkLongRuns([{ ...wk(1, 30), longRunKm: 10 }, { ...wk(2, 20, 'taper'), longRunKm: 4 }]).length === 0, 'sortie longue à ~33 % acceptée, affûtage libre')
expect(checkLongRuns([{ ...wk(1, 28), longRunKm: 7 }]).length === 1, 'sortie longue de 7 km pour 28 km refusée (25 %)')

// Le cas signalé sur un plan existant : mar. 10 km (fait), jeu. 11 km, dim. sortie longue 7 km → volume reporté sur la sortie longue.
{
  const d = (n: number) => addDays(today(), n)
  const sessions = [
    { ...run(d(-1), 10), id: 'tue' },
    { ...run(d(1), 11), id: 'thu' },
    { ...run(d(4), 7, 'long'), id: 'sun' },
  ]
  const plan: Plan = { id: 'p', createdAt: '', name: '', overview: '', startDate: d(-2), raceDate: d(60), weeks: [{ ...week, start: d(-2), end: d(4), targetKm: 28, longRunKm: 7, sessions }] }
  const { plan: fixed, changed } = fixLongRuns(plan, zones, today(), new Set(['tue']))
  const kmOf = (id: string) => sessionTotals(fixed.weeks[0].sessions.find((s) => s.id === id)!, zones).meters / 1000
  expect(changed.length === 2, 'sortie longue et footing à venir corrigés')
  expect(kmOf('sun') >= 10.5 && kmOf('sun') > kmOf('thu') && kmOf('sun') > kmOf('tue'), `sortie longue redevenue la plus longue (${kmOf('sun')} km)`)
  expect(kmOf('tue') === 10, 'séance passée inchangée')
  expect(Math.abs(kmOf('sun') + kmOf('thu') - 18) < 0.2, 'volume de la semaine conservé')
  expect(fixLongRuns(fixed, zones, today(), new Set(['tue'])).changed.length === 0, 'semaine cohérente laissée telle quelle')
}

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
