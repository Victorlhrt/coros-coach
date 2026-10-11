import { predictTime, thresholdPace, vdot } from '../src/lib/coach/vdot'
// Références Daniels : 10 km en 42:04 ≈ VDOT 49-50, allure seuil ≈ 4:15-4:20/km, 5 km ≈ 20:18.
const v = vdot(10000, 42 * 60 + 4)
const t = thresholdPace(v)
const fiveK = predictTime(v, 5000)
console.log({ vdot: v.toFixed(1), threshold: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, fiveK: `${Math.floor(fiveK / 60)}:${String(fiveK % 60).padStart(2, '0')}` })
console.log(Math.abs(v - 49.5) < 1 && t >= 250 && t <= 265 && Math.abs(fiveK - 1218) < 25 ? 'OK' : 'ÉCHEC')
