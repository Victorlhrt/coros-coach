// Vérifie hors ligne l'aperçu de la montre de l'onboarding (server/src/platform/watch-insights.ts).
import { normalizeActivities as frontNormalize } from '../src/lib/coros/activities'
import { vdot as frontVdot } from '../src/lib/coach/vdot'
import { normalizeActivities } from '../server/src/platform/coros-records'
import { bestsFromRuns, buildInsights, corosInsights, flatten, parseFitness, parseSince, summarizeRuns, vdot, type RunLike } from '../server/src/platform/watch-insights'

const errors: string[] = []
const expect = (ok: boolean, msg: string) => ok || errors.push(msg)

// Réponse texte réelle de querySportRecords (voir check-activities.ts).
const sample = `Sport Records — 2026-08-30 to 2026-10-11 (2 records)
========================

1. Outdoor Run — 2026-10-11
   Location: Saint-Denis Course
   Start Coordinates: 48.924999, 2.362000
   Time Window: startTimestamp=1791698430 | endTimestamp=1791704330
   Duration: 1:33:45 | Distance: 21.11 km
   Average Pace: 4:27 /km | Avg HR: 171 bpm | Calories: 1743 kcal
   LabelId: 480957002474881327 | SportType: 100

2. Outdoor Run — 2026-10-09
   Location: Paris Course
   Start Coordinates: 48.866001, 2.335000
   Time Window: startTimestamp=1791566350 | endTimestamp=1791568799
   Duration: 38:37 | Distance: 6.92 km
   Average Pace: 5:35 /km | Avg HR: 146 bpm | Calories: 556 kcal
   LabelId: 480936539369537841 | SportType: 100
`

// La copie serveur du lecteur reste identique à celle du navigateur.
expect(JSON.stringify(normalizeActivities(sample)) === JSON.stringify(frontNormalize(sample)), 'lecteur serveur = lecteur navigateur (texte)')
const json = { data: { records: [{ labelId: 1, date: '20261001', distance: 10120, totalTime: 2580, sportType: 100 }] } }
expect(JSON.stringify(normalizeActivities(json)) === JSON.stringify(frontNormalize(json)), 'lecteur serveur = lecteur navigateur (JSON)')
expect(Math.abs(vdot(10000, 2550) - frontVdot(10000, 2550)) < 1e-9, 'VDOT serveur = VDOT navigateur')

// Mercredi 28 octobre 2026 : les 4 semaines complètes vont du lundi 28 sept. au dimanche 25 oct.
const now = new Date(2026, 9, 28, 12)
const run = (date: string, km: number, min: number): RunLike => ({ date, meters: km * 1000, seconds: min * 60 })
const runs: RunLike[] = [
  run('2026-10-27', 10, 50), // semaine en cours : hors moyenne
  // 8 semaines : mardi 8 km, jeudi 10 km, dimanche sortie longue
  ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((w) => {
    const monday = new Date(2026, 9, 19 - 7 * w)
    const day = (n: number) => {
      const d = new Date(monday)
      d.setDate(d.getDate() + n)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return [run(day(1), 8, 42), run(day(3), 10, 50), run(day(6), 16 + w, 95)]
  }),
  run('2026-06-01', 30, 160), // plus de 12 semaines : ignorée pour la plus longue
]
const s = summarizeRuns(runs, now)
// 4 semaines (w = 0…3) : 8 + 10 + (16 + w) → 34, 35, 36, 37 → 35,5 → 36
expect(s.weeklyKm === 36, `volume moyen sur 4 semaines complètes (${s.weeklyKm})`)
expect(s.runsPerWeek === 3, `sorties par semaine (${s.runsPerWeek})`)
expect(s.longestRunKm === 23, `plus longue sortie sur 12 semaines (${s.longestRunKm})`)
expect(JSON.stringify(s.usualDays) === JSON.stringify(['tue', 'thu', 'sun']), `jours habituels (${s.usualDays})`)
expect(s.longRunDay === 'sun', `jour de sortie longue (${s.longRunDay})`)
expect(summarizeRuns([], now).weeklyKm === null, 'sans sortie : volume inconnu')
expect(summarizeRuns([run('2026-09-01', 10, 50)], now).weeklyKm === 0, 'sorties anciennes seulement : 0 km par semaine')

// Meilleurs temps : distance +0 à 8 %, temps ramené à la distance exacte.
const bests = bestsFromRuns([run('2026-05-10', 10.2, 43), run('2026-09-20', 10.05, 42), run('2026-04-01', 21.2, 95), run('2026-03-01', 12, 50)])
expect(bests.length === 2, `deux distances (${bests.map((b) => b.label)})`)
expect(bests[0]?.label === '10 km' && bests[0].seconds === Math.round(42 * 60 * (10000 / 10050)) && bests[0].date === '2026-09-20', `meilleur 10 km (${JSON.stringify(bests[0])})`)
expect(bests[1]?.label === 'Half', 'semi')

// Forme COROS : texte supposé du serveur, et JSON.
const fitnessText = `Fitness Assessment Overview
VO2max: 52.4 | Running Fitness: 78
Threshold HR: 172 bpm | Threshold Pace: 4:12 /km
Race Predictor: 5K: 19:45 | 10K: 41:10 | Half Marathon: 1:31:20 | Marathon: 3:10`
const f = parseFitness(fitnessText)
expect(f.vo2max === 52.4, `VO2max (texte) ${f.vo2max}`)
expect(f.thresholdPace === 252, `allure seuil (texte) ${f.thresholdPace}`)
const pred = Object.fromEntries((f.predictions ?? []).map((p) => [p.label, p.seconds]))
expect(pred['5 km'] === 1185 && pred['10 km'] === 2470 && pred.Half === 5480 && pred.Marathon === 11400, `prédictions (texte) ${JSON.stringify(pred)}`)

const fitnessJson = { data: { vo2Max: 49, lthr: 168, thresholdPace: 265, racePredictor: [{ distance: '5K', time: '20:30' }, { distance: 'Half Marathon', time: '1:35:00' }, { distance: 'Marathon', time: 12100 }] } }
const fj = parseFitness(fitnessJson)
expect(fj.vo2max === 49, `VO2max (JSON) ${fj.vo2max} — ${flatten(fitnessJson).join(' / ')}`)
expect(fj.thresholdPace === 265, `allure seuil (JSON) ${fj.thresholdPace}`)
const pj = Object.fromEntries((fj.predictions ?? []).map((p) => [p.label, p.seconds]))
expect(pj['5 km'] === 1230 && pj.Half === 5700 && pj.Marathon === 12100 && !pj['10 km'], `prédictions (JSON) ${JSON.stringify(pj)}`)
expect(parseFitness('VO2max: -- | no data').vo2max === null, 'VO2max absente')
expect(parseFitness({ vo2max: 300 }).vo2max === null, 'VO2max hors bornes ignorée')

expect(parseSince({ data: { nickname: 'V', registerDate: 20190312 } }, now) === '2019-03-12', 'date d’inscription (AAAAMMJJ)')
expect(parseSince('Created: 2021-06-02', now) === '2021-06-02', 'date d’inscription (texte)')
expect(parseSince({ createTime: 1559347200 }, now) === '2019-06-01', 'date d’inscription (timestamp)')
expect(parseSince({ nickname: 'V' }, now) === null, 'sans date')

// Sans VO2max de la montre : estimation par la VDOT du meilleur temps.
const est = buildInsights('garmin', { recent: runs, bests }, now)
expect(est.vo2maxEstimated && est.vo2max === Math.round(Math.max(...bests.map((b) => vdot(b.meters, b.seconds)))), `VO2max estimée (${est.vo2max})`)
expect(buildInsights('coros', { recent: [], bests, fitness: fitnessText }, now).vo2maxEstimated === false, 'VO2max de la montre prioritaire')

// Lecture COROS complète avec des outils simulés, dont un en échec.
const calls: string[] = []
const fake = async (tool: string, args: Record<string, unknown> = {}) => {
  calls.push(tool)
  if (tool === 'queryUserInfo') throw new Error('indisponible')
  if (tool === 'queryFitnessAssessmentOverview') return fitnessText
  if (args.minDistanceKm === null) throw new Error('minDistanceKm must be a number')
  if (args.minDistanceKm === 0) return sample
  return (args.minDistanceKm as number) > 20 && (args.minDistanceKm as number) < 22 ? sample : 'Sport Records — no records'
}
const ci = await corosInsights(fake, new Date(2026, 9, 14, 12))
expect(ci.source === 'coros', 'source')
expect(ci.longestRunKm === 21.1, `plus longue sortie COROS (${ci.longestRunKm})`)
expect(ci.bests.length === 1 && ci.bests[0].label === 'Half' && ci.bests[0].date === '2026-10-11', `record semi COROS (${JSON.stringify(ci.bests)})`)
expect(ci.vo2max === 52.4 && !ci.vo2maxEstimated, 'VO2max COROS')
expect(ci.since === null, 'queryUserInfo en échec : since null')
expect(calls.filter((t) => t === 'querySportRecords').length === 6, `un seul nouvel essai avec valeurs permissives (${calls.length})`)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('check-insights : ok')
