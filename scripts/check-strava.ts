// Vérifie hors ligne la lecture de activities.csv (export Strava, en anglais et en français) : sorties course, forme Activity.
process.env.TZ = 'Europe/Paris'
import { parseStravaRuns, stravaRunToActivity, summarizeStravaRuns } from '../src/platform/onboarding/strava'

const EN_HEAD =
  'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Max Speed,Average Speed,Elevation Gain,Elevation Loss,Average Heart Rate'
const en = `﻿${EN_HEAD}
11111111111,"Oct 12, 2026, 6:05:00 AM",Morning Run,Run,"",3010,10.02,175,80,false,,,activities/1.fit.gz,,,3010.0,2950.0,10020.4,4.5,3.4,45.0,44.0,160.3
11111111112,"Oct 11, 2026, 10:30:00 PM","Night ""trail"", Montmartre",Trail Run,"Two lines
of description",5400,12.30,180,120,false,,,activities/2.fit.gz,,,5400.0,5100.0,12300.0,4.0,2.4,420.0,418.0,151.0
11111111113,"Oct 10, 2026, 9:00:00 AM",Coffee ride,Ride,"",7200,50.1,150,60,false,,,activities/3.fit.gz,,,7200.0,7000.0,50100.0,12.0,7.1,300.0,300.0,130.0
11111111114,"5 janv. 2026, 07:12:34",Footing,Course à pied,"",1800,5.00,,,false,,,,,,1800.0,,5000.0,,,10.0,10.0,
`

const FR_HEAD =
  "ID de l'activité,Date de l'activité,Nom de l'activité,Type d'activité,Description de l'activité,Temps écoulé,Distance,Fréquence cardiaque max.,Effort relatif,Trajet domicile-travail,Remarque privée sur l'activité,Matériel de l'activité,Nom du fichier,Poids de l'athlète,Poids du vélo,Temps écoulé,Temps de déplacement,Distance,Vitesse max.,Vitesse moyenne,Dénivelé positif,Dénivelé négatif,Fréquence cardiaque moyenne"
const fr = `${FR_HEAD}
2222,"12 oct. 2026, 18:15:00",Sortie du soir,Course à pied,"",3600,"12,50",170,70,false,,,,,,"3600,0","3500,0","12500,3","4,0","3,5","120,0","118,0","150,0"
2223,"1 févr. 2026, 08:00:00",Trail des Buttes,Trail,"",9000,"20,00",,,false,,,,,,"9000,0","8700,0","20000,0",,,"900,0","900,0",
2224,"3 févr. 2026, 08:00:00",Vélotaf,Vélo,"",1800,"8,00",,,false,,,,,,"1800,0","1700,0","8000,0",,,"20,0","20,0",
`

const errors: string[] = []
const expect = (ok: boolean, msg: string) => ok || errors.push(msg)

const runs = parseStravaRuns(en)
expect(runs.length === 3, `anglais : 3 sorties course, vélo ignoré (${runs.length})`)
const [jan, night, morning] = runs
expect(jan?.date === '2026-01-05' && jan.name === 'Footing', `date française dans un export anglais (${jan?.date})`)
expect(jan?.movingSeconds === 1800 && jan.avgHr === null, `sans temps en mouvement ni FC : temps écoulé, FC nulle (${jan?.movingSeconds}, ${jan?.avgHr})`)
expect(morning?.id === '11111111111', `identifiant (${morning?.id})`)
expect(morning?.date === '2026-10-12', `jour local du départ (${morning?.date})`)
expect(morning?.startMs === Date.UTC(2026, 9, 12, 6, 5), 'départ en UTC')
expect(morning?.meters === 10020, `distance en mètres, 2e colonne (${morning?.meters})`)
expect(morning?.movingSeconds === 2950 && morning.elapsedSeconds === 3010, `temps en mouvement / écoulé (${morning?.movingSeconds}/${morning?.elapsedSeconds})`)
expect(morning?.avgHr === 160 && morning.elevation === 45, `FC moyenne et dénivelé (${morning?.avgHr}, ${morning?.elevation})`)
expect(night?.name === 'Night "trail", Montmartre', `nom avec guillemets et virgule (${night?.name})`)
expect(night?.trail === true, 'trail reconnu')
expect(night?.date === '2026-10-12', `22:30 UTC = lendemain 00:30 à Paris (${night?.date})`)
expect(night?.startMs === Date.UTC(2026, 9, 11, 22, 30), 'heure PM')

const a = morning && stravaRunToActivity(morning)
expect(a?.labelId === 'strava:11111111111', `labelId (${a?.labelId})`)
expect(a?.sportType === 100 && stravaRunToActivity(night!).sportType === 100, 'sportType course, trail compris')
expect(a?.place === null && a.name === 'Morning Run', 'nom, lieu nul')
expect(a?.seconds === 2950 && a.meters === 10020 && a.avgHr === 160, 'durée, distance, FC')
expect(a?.paceSecPerKm === 294, `allure (${a?.paceSecPerKm})`)

const frRuns = parseStravaRuns(fr)
expect(frRuns.length === 2, `français : 2 sorties, vélo ignoré (${frRuns.length})`)
const [trail, evening] = frRuns
expect(evening?.id === '2222' && evening.date === '2026-10-12', `en-têtes français (${evening?.id}, ${evening?.date})`)
expect(evening?.meters === 12500 && evening.movingSeconds === 3500 && evening.avgHr === 150 && evening.elevation === 120, 'décimales à virgule')
expect(trail?.trail === true && trail.date === '2026-02-01', `type « Trail », février (${trail?.date})`)

const summary = summarizeStravaRuns(runs, Date.UTC(2026, 9, 20))
expect(summary.runs === 3 && summary.since === '2026-01-05', `résumé : total et première sortie (${summary.runs}, ${summary.since})`)
expect(summary.recent.runs === 2 && summary.recent.km === 22, `résumé : 12 dernières semaines (${summary.recent.runs}, ${summary.recent.km})`)
expect(summary.performances.some((p) => p.label === '10 km Strava' && p.date === '2026-10-12'), 'meilleur 10 km de l’année')

let threw = false
try {
  parseStravaRuns('foo,bar\n1,2\n')
} catch {
  threw = true
}
expect(threw, 'format inconnu refusé')

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('check-strava : ok')
