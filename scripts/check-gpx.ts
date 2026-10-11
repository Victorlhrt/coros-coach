// Parcours synthétique : 20 km, une montée de 300 m (km 5 → 8), une descente de 300 m (km 12 → 15).
import { analyzePoints, type Point } from '../src/lib/coach/gpx'

const points: Point[] = []
for (let m = 0; m <= 20000; m += 20) {
  const km = m / 1000
  let ele = 200
  if (km > 5 && km <= 8) ele = 200 + ((km - 5) / 3) * 300
  else if (km > 8 && km <= 12) ele = 500
  else if (km > 12 && km <= 15) ele = 500 - ((km - 12) / 3) * 300
  ele += Math.sin(m / 37) * 2 // bruit GPS
  points.push({ lat: 45 + m / 111_195, lon: 6, ele })
}
const c = analyzePoints('test', points)
console.log({ distanceKm: c.distanceKm, gain: c.gain, loss: c.loss, maxEle: c.maxEle, profilePoints: c.profile.length })
console.log(c.segments)
const ok =
  Math.abs(c.distanceKm - 20) < 0.2 &&
  Math.abs(c.gain - 300) < 30 &&
  c.segments.length === 2 &&
  c.segments[0].kind === 'climb' &&
  Math.abs(c.segments[0].startKm - 5) < 0.3 &&
  c.segments[1].kind === 'descent'
console.log(ok ? 'OK' : 'ÉCHEC')
