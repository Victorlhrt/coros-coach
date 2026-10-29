// Vérifie hors ligne la lecture des réponses de l'API Personal de Garmin Connect (liste d'activités, FIT zippé, jeton)
// et la fusion COROS + Garmin. Échantillons construits sur la spécification OpenAPI officielle (SummarizedActivityDTO :
// startTimeLocal « yyyy-MM-dd HH:mm:ss », distance en m, duration en s, beginTimestamp en ms, activityType {typeId, typeKey, parentTypeId}).
import { Encoder, Profile } from '@garmin/fitsdk'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'
import { extractToken, garminSportType, jwtExpiry, lapsFromActivityFile, normalizeGarminActivities } from '../server/src/platform/garmin-normalize'
import { mergeActivities } from '../src/lib/garmin/merge'

const errors: string[] = []
const expect = (ok: boolean, msg: string) => ok || errors.push(msg)
const near = (a: number | null | undefined, b: number, eps = 0.5) => a != null && Math.abs(a - b) <= eps

const sample = [
  {
    activityId: 20412345678,
    activityName: 'Paris Running',
    startTimeLocal: '2026-10-11 07:20:30',
    startTimeGMT: '2026-10-11 05:20:30',
    beginTimestamp: 1791696030000,
    activityType: { typeId: 1, typeKey: 'running', parentTypeId: 17 },
    distance: 21110.5,
    duration: 5625.2,
    movingDuration: 5601.1,
    elapsedDuration: 5640.9,
    averageHR: 171,
    locationName: 'Paris',
  },
  {
    activityId: 20411111111,
    activityName: 'Morning Trail',
    startTimeLocal: '2026-10-09 23:40:00',
    startTimeGMT: '2026-10-09 21:40:00',
    activityType: { typeId: 6, typeKey: 'trail_running', parentTypeId: 1 },
    distance: 12000,
    duration: 4200,
    averageHR: 150,
    locationName: 'Fontainebleau',
  },
  {
    activityId: 20410000000,
    activityName: 'Treadmill',
    startTimeLocal: '2026-10-08 18:00:00',
    activityType: { typeId: 18, typeKey: 'treadmill_running', parentTypeId: 1 },
    distance: 8000,
    duration: 2400,
  },
  {
    activityId: 20400000000,
    activityName: 'Lunch Ride',
    startTimeLocal: '2026-10-07 12:00:00',
    activityType: { typeId: 2, typeKey: 'cycling', parentTypeId: 17 },
    distance: 30000,
    duration: 3600,
  },
]

const acts = normalizeGarminActivities(sample)
const [a, b, c] = acts
expect(acts.length === 3, `3 courses, le vélo est écarté (${acts.length})`)
expect(a?.labelId === 'garmin:20412345678', `labelId préfixé (${a?.labelId})`)
expect(a?.date === '2026-10-11', `date locale (${a?.date})`)
expect(a?.name === 'Paris Running', `lieu déjà dans le nom, pas répété (${a?.name})`)
expect(a?.place === 'Paris', 'lieu')
expect(a?.meters === 21110.5 && near(a?.seconds, 5625.2, 0.01), 'distance et durée chronométrée')
expect(near(a?.paceSecPerKm, 266.5), `allure (${a?.paceSecPerKm})`)
expect(a?.avgHr === 171, 'FC moyenne')
expect(a?.sportType === 100 && b?.sportType === 102 && c?.sportType === 101, `codes de sport COROS (${a?.sportType}/${b?.sportType}/${c?.sportType})`)
// Date locale : une sortie à 23 h 40 reste le jour local, même si l'UTC est différent.
expect(b?.date === '2026-10-09', `date locale nocturne (${b?.date})`)
expect(b?.name === 'Morning Trail · Fontainebleau', `lieu ajouté au nom (${b?.name})`)
expect(b?.startMs === Date.parse('2026-10-09T21:40:00Z'), 'départ UTC lu dans startTimeGMT')
expect(c?.avgHr === null && c?.place === null, 'champs absents à null')
expect(normalizeGarminActivities(null).length === 0 && normalizeGarminActivities({}).length === 0, 'réponse invalide')
expect(garminSportType('track_running') === 103, 'piste')

// Jeton : JWT brut en texte, exp en secondes.
const exp = 1793000000
const jwt = `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({ exp, sub: 'x' })).toString('base64url')}.c2ln`
expect(extractToken(`${jwt}\n`) === jwt, 'jeton brut')
expect(extractToken(JSON.stringify({ access_token: jwt })) === jwt, 'jeton dans une enveloppe JSON')
expect(extractToken('<html>maintenance</html>') === null, 'page HTML refusée')
expect(jwtExpiry(jwt) === exp * 1000, 'exp du JWT')

// FIT : trois tours encodés avec le SDK FIT officiel, zippés comme le renvoie /download-service/files/activity/{id}.
const encoder = new Encoder()
const t0 = new Date('2026-10-11T05:20:30Z')
encoder.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, manufacturer: 'garmin', product: 1, timeCreated: t0, type: 'activity' })
const laps = [
  { d: 1000, t: 300, hr: 140 },
  { d: 1000, t: 270, hr: 158 },
  { d: 520.4, t: 150.5, hr: 165 },
]
let elapsed = 0
laps.forEach((l, i) => {
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.LAP,
    messageIndex: i,
    timestamp: new Date(t0.getTime() + (elapsed + l.t) * 1000),
    startTime: new Date(t0.getTime() + elapsed * 1000),
    totalElapsedTime: l.t + 2,
    totalTimerTime: l.t,
    totalDistance: l.d,
    avgHeartRate: l.hr,
  })
  elapsed += l.t
})
const fit = encoder.close()

const main = async () => {
  const zipW = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false })
  await zipW.add('20412345678_ACTIVITY.fit', new Uint8ArrayReader(fit))
  const zip = await zipW.close()

  for (const [label, bytes] of [['zip', zip], ['fit nu', fit]] as const) {
    const out = await lapsFromActivityFile(bytes)
    expect(out.length === 3, `${label} : 3 tours (${out.length})`)
    expect(out[0]?.index === 1 && out[2]?.index === 3, `${label} : index`)
    expect(near(out[1]?.meters, 1000, 0.01) && near(out[1]?.seconds, 270, 0.01), `${label} : distance/durée du tour 2 (${out[1]?.meters}, ${out[1]?.seconds})`)
    expect(near(out[1]?.paceSecPerKm, 270), `${label} : allure du tour 2 (${out[1]?.paceSecPerKm})`)
    expect(out[2]?.avgHr === 165, `${label} : FC du tour 3`)
  }
  expect((await lapsFromActivityFile(new Uint8Array([1, 2, 3, 4]))).length === 0, 'fichier illisible')

  // Fusion : la sortie du 11 existe aussi sur COROS (distance à 0,3 %) → gardée une fois, côté COROS.
  const coros = [
    { labelId: '480957002474881327', sportType: 100, date: '2026-10-11', name: 'Outdoor Run · Paris', place: 'Paris', meters: 21050, seconds: 5625, paceSecPerKm: 267, avgHr: 171 },
    { labelId: '480936539369537841', sportType: 100, date: '2026-10-09', name: 'Outdoor Run', place: null, meters: 6920, seconds: 2317, paceSecPerKm: 335, avgHr: 146 },
  ]
  const merged = mergeActivities(coros, acts)
  expect(merged.length === 4, `fusion sans doublon (${merged.length})`)
  expect(merged.filter((m) => m.date === '2026-10-11').length === 1 && merged[0]?.labelId === '480957002474881327', 'doublon gardé côté COROS')
  expect(merged.some((m) => m.labelId === 'garmin:20411111111'), 'trail Garmin du même jour qu’une autre sortie COROS gardé')
  expect(merged.every((m) => !('startMs' in m)), 'startMs retiré des activités fusionnées')
  expect(mergeActivities([], acts).length === 3, 'Garmin seul')

  if (errors.length) {
    console.error(`check-garmin : ${errors.length} échec(s)\n- ${errors.join('\n- ')}`)
    process.exit(1)
  }
  console.log('check-garmin : OK')
}

void main()
