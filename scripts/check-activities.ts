// Vérifie hors ligne la lecture de la réponse texte de querySportRecords (format réel du serveur COROS).
import { normalizeActivities } from '../src/lib/coros/activities'
import { normalizeLaps } from '../src/lib/coros/laps'

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

const errors: string[] = []
const expect = (ok: boolean, msg: string) => ok || errors.push(msg)

const [a, b] = normalizeActivities(sample)
expect(normalizeActivities(sample).length === 2, 'deux activités lues')
expect(a?.labelId === '480957002474881327', `labelId exact (${a?.labelId})`)
expect(a?.sportType === 100, 'sportType')
expect(a?.date === '2026-10-11', `date (${a?.date})`)
expect(a?.name === 'Outdoor Run · Saint-Denis', `nom avec le lieu (${a?.name})`)
expect(a?.place === 'Saint-Denis', `lieu (${a?.place})`)
expect(a?.meters === 21110, `distance en mètres (${a?.meters})`)
expect(a?.seconds === 5625, `durée h:mm:ss (${a?.seconds})`)
expect(a?.paceSecPerKm === 267, `allure (${a?.paceSecPerKm})`)
expect(b?.seconds === 2317, `durée mm:ss (${b?.seconds})`)
expect(normalizeActivities('Sport Records — aucun résultat').length === 0, 'texte sans fiche')

// Splits COROS : distance des tours en centimètres, recalée sur la distance de l'activité.
const laps = normalizeLaps({ data: { lapList: [{ distance: 100000, time: 422, avgHr: 118 }, { distance: 100000, time: 360, avgHr: 138 }] } }, 2000)
expect(laps[0]?.meters === 1000, `tour en mètres (${laps[0]?.meters})`)
expect(laps[0]?.paceSecPerKm === 422, `allure du tour (${laps[0]?.paceSecPerKm})`)
expect(normalizeLaps({ laps: [{ distance: 1000, time: 300 }] }, 1000)[0]?.meters === 1000, 'tours déjà en mètres inchangés')

// Fractionné : les tours de la séance l'emportent sur les splits auto au kilomètre (qui lissent les répétitions).
const km = (time: number) => ({ distance: 100000, time })
const workout = normalizeLaps({ lapList: [{ type: 1, items: [km(300), km(300), km(300), { distance: 60000, time: 180 }] }, { type: 2, items: [{ distance: 150000, time: 480 }, { distance: 40000, time: 84 }, { distance: 20000, time: 70 }, { distance: 40000, time: 85 }, { distance: 110000, time: 360 }] }] }, 3600)
expect(workout.length === 5 && Math.round(workout[1]?.paceSecPerKm ?? 0) === 210, `tours de séance préférés aux splits km (${workout.length} tours)`)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('check-activities : ok')
