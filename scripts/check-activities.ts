// Vérifie hors ligne la lecture de la réponse texte de querySportRecords (format réel du serveur COROS).
import { normalizeActivities } from '../src/lib/coros/activities'

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
expect(a?.name === 'Outdoor Run', `nom (${a?.name})`)
expect(a?.meters === 21110, `distance en mètres (${a?.meters})`)
expect(a?.seconds === 5625, `durée h:mm:ss (${a?.seconds})`)
expect(a?.paceSecPerKm === 267, `allure (${a?.paceSecPerKm})`)
expect(b?.seconds === 2317, `durée mm:ss (${b?.seconds})`)
expect(normalizeActivities('Sport Records — aucun résultat').length === 0, 'texte sans fiche')

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('check-activities : ok')
