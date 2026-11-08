import { recommendVolume } from '../src/platform/onboarding/recommend'

let failed = 0
const expect = (ok: boolean, label: string) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}

// Cas signalé : 12 km/semaine, trail de 67 km dans 90 jours, confirmé, 5 jours → pic de 20 km avant la correction.
const william = recommendVolume({ currentKm: 12, raceKm: 67.2, elevation: 0, trail: true, daysToRace: 90, level: 'confirme', runDays: 5 })
expect(william.peakKm === 60 && william.idealKm === 65, `confirmé à 12 km, trail de 67 km : pic à ${william.peakKm} km (60), idéal ${william.idealKm} (65), moyenne ${william.averageKm}`)
const inter = recommendVolume({ currentKm: 12, raceKm: 67.2, trail: true, daysToRace: 90, level: 'intermediaire', runDays: 5 })
expect(inter.peakKm === 40, `intermédiaire, même cas : pic à ${inter.peakKm} km (40)`)
// Gros volume : la progression en pourcentage reste la règle.
const big = recommendVolume({ currentKm: 50, raceKm: 42.195, daysToRace: 84, level: 'intermediaire', runDays: 5 })
expect(big.peakKm === 70, `50 km/semaine, marathon dans 12 semaines : pic à ${big.peakKm} km (70)`)
// Peu de temps : la progression borne toujours le pic.
const short = recommendVolume({ currentKm: 15, raceKm: 42.195, daysToRace: 35, level: 'intermediaire', runDays: 4 })
expect(short.peakKm <= 25, `15 km/semaine, marathon dans 5 semaines : pic à ${short.peakKm} km (≤ 25)`)

if (failed) process.exit(1)
console.log('OK')
