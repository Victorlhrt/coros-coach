import { callStructured } from './claude'
import { WEEKDAYS_FR as WEEKDAYS, addDays, diffDays, planWeeks, today, weekday, type WeekSlot } from './dates'
import { COACH_SYSTEM, describeGoal, describeProfile, describeZones, isTrailGoal } from './prompts'
import {
  ProfileSchema,
  SkeletonSchema,
  WeeksSessionsSchema,
  type Goal,
  type Plan,
  type Profile,
  type Session,
  type Skeleton,
  type SessionInput,
  type Week,
  type Zone,
} from './schema'
import { goalPace } from './repace'
import { validateSessions } from './validate'
import { sessionTotals } from './metrics'
import { planVolumes } from './progression'
import type { RaceRecord } from './vdot'

/** Profil coureur extrait des réponses brutes de COROS (formats non documentés → on laisse Claude lire). */
export async function extractProfile(raw: Record<string, unknown>): Promise<Profile> {
  const dump = Object.entries(raw)
    .map(([tool, value]) => `### ${tool}\n${JSON.stringify(value).slice(0, 15000)}`)
    .join('\n\n')
  return callStructured({
    system:
      'Tu extrais des données d’entraînement depuis des réponses brutes de l’API COROS. N’invente rien : null si une valeur est absente. Allures en secondes par km, temps en secondes.',
    prompt: `Date du jour : ${today()}.\n\n${dump}\n\nExtrait le profil du coureur.`,
    schema: ProfileSchema,
    maxTokens: 2000,
  })
}

export type Progress = { step: string; done: number; total: number }

const CHUNK = 4

/** Génération en cours, sauvegardée à chaque étape pour reprendre après un rechargement. */
export interface PlanDraft {
  goal: Goal
  skeleton: Skeleton | null
  /** Séances déjà écrites, par numéro de semaine. */
  sessions: Record<number, SessionInput[]>
  /** La dernière tentative a échoué : on ne reprend pas tout seul, seulement quand on relance. */
  failed?: boolean
}

const DRAFT_KEY = 'coach.planDraft'

export function loadDraft(): PlanDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as PlanDraft) : null
  } catch {
    return null
  }
}

function saveDraft(draft: PlanDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Stockage indisponible : la génération continue, sans reprise possible.
  }
}

/** Garde les étapes réussies après un échec, sans reprise automatique au prochain affichage. */
export function markDraftFailed() {
  const draft = loadDraft()
  if (draft) saveDraft({ ...draft, failed: true })
}

let running = false
/** Vrai tant qu'une génération tourne dans cet onglet (évite d'en relancer une en revenant sur l'écran). */
export const isGenerating = () => running

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Rien à nettoyer.
  }
}

/** Dates disponibles d'une semaine selon les jours choisis. */
function availableDates(slot: WeekSlot, goal: Goal) {
  const dates: string[] = []
  for (let d = slot.start; d <= slot.end; d = addDays(d, 1)) {
    if (goal.days.includes(weekday(d)) && d <= goal.raceDate) dates.push(d)
  }
  if (goal.raceDate >= slot.start && goal.raceDate <= slot.end && !dates.includes(goal.raceDate)) dates.push(goal.raceDate)
  return dates.sort()
}

/**
 * Structure du plan, puis séances par blocs de 4 semaines écrits en parallèle.
 * Chaque étape terminée est sauvegardée : avec `resume`, seules les étapes manquantes sont relancées.
 */
export async function generatePlan(
  goal: Goal,
  profile: Profile | null,
  zones: Zone[],
  onProgress: (p: Progress) => void,
  records: RaceRecord[] = [],
  resume: PlanDraft | null = null,
): Promise<Plan> {
  running = true
  try {
    return await buildPlan(goal, profile, zones, onProgress, records, resume)
  } finally {
    running = false
  }
}

async function buildPlan(
  goal: Goal,
  profile: Profile | null,
  zones: Zone[],
  onProgress: (p: Progress) => void,
  records: RaceRecord[],
  resume: PlanDraft | null,
): Promise<Plan> {
  const { start, weeks: slots, error } = planWeeks(goal.raceDate)
  if (error) throw new Error(error)
  const chunks = Math.ceil(slots.length / CHUNK)
  const total = chunks + 1
  const context = `${describeGoal(goal)}\n\n${describeProfile(profile, records)}\n\nZones d’allure :\n${describeZones(zones)}`
  const trail = isTrailGoal(goal)
  const draft: PlanDraft = resume ? { ...resume, failed: false } : { goal, skeleton: null, sessions: {} }
  saveDraft(draft)

  onProgress({ step: 'Plan structure', done: 0, total })
  // Volume de pointe accepté par le coureur : la progression semaine par semaine est calculée par l'app, Claude écrit autour.
  const volumes = goal.peakWeeklyKm ? planVolumes(slots.length, goal) : null
  const KIND = { build: 'montée', recovery: 'semaine allégée', taper: 'affûtage', race: 'course' }
  const imposed = volumes
    ? `Volumes imposés (calculés par l’app, recopie-les tels quels dans targetKm et longRunKm, phase indiquée) :
${volumes.map((v) => `Semaine ${v.number} : ${v.phase}, ${KIND[v.kind]}, ${v.targetKm} km, sortie longue ${v.longRunKm} km`).join('\n')}
Écris l’objectif (focus) de chaque semaine en cohérence avec ces volumes${trail ? ', et fais suivre au D+ (targetGain) la même progression (recul les semaines allégées)' : ''}.`
    : ''
  const skeleton =
    draft.skeleton ??
    (await callStructured({
      system: COACH_SYSTEM,
      prompt: `${context}

Le plan compte ${slots.length} semaines (lundi-dimanche), du ${start} à la semaine de course :
${slots.map((s) => `Semaine ${s.number} : ${s.start} → ${s.end}`).join('\n')}

${periodizationRules(slots.length, goal)}

${imposed}

Conçois la structure : phase, objectif, volume et sortie longue pour chaque semaine${trail ? ', et le D+ hebdomadaire (targetGain)' : ' (targetGain à 0, ce n’est pas un plan trail)'}. La dernière semaine contient la course, et son volume inclut la distance de la course.
Rédige aussi la stratégie de course (raceStrategy) en t’appuyant sur le parcours : où gérer, où relancer, allure cible par portion.`,
      schema: SkeletonSchema,
      maxTokens: 8000,
      validate: (s, last) => {
        const errors: string[] = []
        if (s.weeks.length !== slots.length) errors.push(`Il faut exactement ${slots.length} semaines (reçu ${s.weeks.length}).`)
        s.weeks.forEach((w, i) => {
          if (w.number !== i + 1) errors.push(`Les semaines doivent être numérotées de 1 à ${slots.length} dans l’ordre.`)
        })
        if (s.planName.length > 60) errors.push('planName : 60 caractères maximum.')
        if (s.overview.length > 700) errors.push('overview : 700 caractères maximum.')
        // Volumes imposés : remplacés par ceux de l'app juste après, inutile de les contrôler.
        if (!volumes) {
          errors.push(...checkVolumes(s.weeks, goal.currentWeeklyKm))
          // Dernière tentative : un pic un peu court ne fait pas échouer toute la génération.
          if (!last) errors.push(...checkPeak(s.weeks, goal.peakWeeklyKm ?? null))
          errors.push(...checkLongRuns(s.weeks))
        }
        if (trail) errors.push(...checkGains(s.weeks, goal.currentWeeklyGain ?? null))
        if (slots.length <= 6 && s.weeks.some((w) => w.phase === 'base')) errors.push(`Plan de ${slots.length} semaines : pas de phase base, commence en build.`)
        return errors
      },
    }))
  if (volumes)
    skeleton.weeks.forEach((w, i) => {
      const v = volumes[i]
      if (!v) return
      w.phase = v.phase
      w.targetKm = v.targetKm
      w.longRunKm = v.longRunKm
    })
  draft.skeleton = skeleton
  saveDraft(draft)

  const weeks: Week[] = slots.map((slot, i) => ({
    ...slot,
    phase: skeleton.weeks[i].phase,
    focus: skeleton.weeks[i].focus,
    targetKm: skeleton.weeks[i].targetKm,
    longRunKm: skeleton.weeks[i].longRunKm,
    ...(trail ? { targetGain: Math.round(skeleton.weeks[i].targetGain) } : {}),
    sessions: [],
  }))
  const outline = weeks
    .map((w) => `Semaine ${w.number} (${w.start} → ${w.end}) : ${w.phase}, ${w.targetKm} km${w.targetGain ? `, ${w.targetGain} m D+` : ''}, sortie longue ${w.longRunKm} km — ${w.focus}`)
    .join('\n')

  const parts = Array.from({ length: chunks }, (_, c) => weeks.slice(c * CHUNK, (c + 1) * CHUNK))
  const isDone = (part: Week[]) => part.every((w) => draft.sessions[w.number])
  let done = 1 + parts.filter(isDone).length
  const report = () => onProgress({ step: done < total ? `Sessions, block ${done} of ${chunks}` : 'Finishing up', done, total })
  report()

  await Promise.all(
    parts.map(async (part) => {
      if (isDone(part)) return
      const allowed = new Map(part.map((w) => [w.number, availableDates(w, goal)]))
      const result = await callStructured({
        system: COACH_SYSTEM,
        prompt: `${context}

Structure du plan :
${outline}

${periodizationRules(slots.length, goal)}

Les autres semaines sont écrites en parallèle selon cette même structure : respecte-la pour que l’enchaînement reste cohérent.
Écris maintenant toutes les séances des semaines ${part.map((w) => w.number).join(', ')}.
Dates autorisées (et seulement celles-ci) :
${part.map((w) => `Semaine ${w.number} : ${allowed.get(w.number)!.map((d) => `${d} (${WEEKDAYS[weekday(d)]})`).join(', ')}`).join('\n')}
${goal.raceDate <= part[part.length - 1].end ? `La course a lieu le ${goal.raceDate} : séance de type race ce jour-là, avec l’allure objectif.` : ''}
Tu n’es pas obligé d’utiliser toutes les dates : adapte le nombre de séances au volume visé.
${trail ? 'Plan trail : renseigne elevationGain pour chaque séance (0 sur le plat) ; leur somme respecte le D+ de la semaine.' : 'elevationGain : null pour toutes les séances (pas un plan trail).'}`,
        schema: WeeksSessionsSchema,
        retries: 3,
        validate: (r, last) => {
          const errors: string[] = []
          for (const w of part) {
            const got = r.weeks.find((x) => x.number === w.number)
            if (!got) errors.push(`Semaine ${w.number} manquante.`)
            else {
              errors.push(...validateSessions(got.sessions, new Set(allowed.get(w.number)), `Semaine ${w.number}`, { zones, goalPace: goalPace(goal) }))
              // Dernière tentative : sortie longue et volume recalés automatiquement ; les règles de coaching restantes
              // (volume, qualité, D+) ne bloquent plus, plutôt que de faire échouer toute la génération.
              if (last) fitWeekVolume(w, got.sessions, zones)
              const soft = [...checkWeekTotals(w, got.sessions, zones), ...checkQuality(w, got.sessions, slots.length), ...(trail ? checkWeekGain(w, got.sessions) : [])]
              if (!last) errors.push(...soft)
              else if (soft.length) console.warn('Plan accepté malgré :', soft)
            }
          }
          return errors
        },
      })
      for (const w of part) draft.sessions[w.number] = result.weeks.find((x) => x.number === w.number)!.sessions
      saveDraft(draft)
      done++
      report()
    }),
  )

  for (const w of weeks) w.sessions = withIds(draft.sessions[w.number])
  onProgress({ step: 'Done', done: total, total })
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: skeleton.planName.slice(0, 60),
    overview: skeleton.overview,
    raceStrategy: skeleton.raceStrategy,
    startDate: start,
    raceDate: goal.raceDate,
    weeks,
    generator: PLAN_GENERATOR,
  }
}

export function withIds(sessions: SessionInput[]): Session[] {
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ ...s, id: crypto.randomUUID() }))
}

export function planDayNo(plan: Plan, date: string) {
  return diffDays(plan.startDate, date)
}

/** Progression du volume : départ proche du volume actuel, hausse limitée d'une semaine à l'autre. */
/** Version des règles de génération : 2 = périodisation selon la durée du plan (plans courts sans phase de base). */
export const PLAN_GENERATOR = 2

/**
 * Périodisation selon la durée du plan : un plan court n'a pas le temps d'une phase de base sans intensité.
 * Envoyé avec la structure et avec l'écriture des séances.
 */
export function periodizationRules(weeks: number, goal: Pick<Goal, 'level' | 'days'>) {
  const twoQuality = goal.level !== 'beginner' && goal.days.length >= 4
  if (weeks <= 6)
    return `Plan COURT (${weeks} semaines) : pas de phase base. La semaine 1 est déjà en build, avec du travail spécifique (fractionné VMA, seuil, allure course).
- Chaque semaine contient au moins une séance de qualité dédiée (type interval ou tempo, avec un bloc work en zone 4 ou 5)${twoQuality ? ', et deux séances de qualité les semaines de build et de peak (la sortie longue avec blocs à allure course peut compter comme la deuxième)' : ''}.
- Pas de semaine allégée en cours de plan : seul l'affûtage allège, sur la dernière semaine (ou les 7 à 10 derniers jours), et il garde une séance d'intensité courte.
- Le focus de chaque semaine nomme sa séance clé.`
  if (weeks <= 9)
    return `Plan de ${weeks} semaines : base d'une à deux semaines au plus, et même en base une séance de qualité légère chaque semaine (côtes courtes, fartlek, seuil court).
- Chaque semaine hors course contient au moins une séance de qualité dédiée (type interval ou tempo)${twoQuality ? ', deux en build et en peak' : ''}.
- Une seule semaine allégée en cours de plan au plus ; affûtage d'une semaine (10 km, semi) à deux (marathon).`
  const base = weeks >= 14 ? '4 à 6 semaines' : '3 à 4 semaines'
  return `Plan LONG (${weeks} semaines) : on a le temps de bien préparer le corps avant l'intensité.
- Base de ${base} : volume et sortie longue qui montent progressivement, endurance surtout, avec chaque semaine des lignes droites, des côtes courtes ou un fartlek léger (pas encore de fractionné dur ni de seuil long).
- Semaine allégée toutes les 3 à 4 semaines.
- Dès la phase build, au moins une séance de qualité dédiée (type interval ou tempo) chaque semaine${twoQuality ? ', deux en build et en peak' : ''}, en durcissant progressivement (volume de travail d'abord, intensité ensuite).
- Affûtage d'une semaine (10 km) à deux ou trois (marathon).`
}

/** Plans de moins de 10 semaines : chaque semaine hors course a au moins une vraie séance de qualité. */
export function checkQuality(week: Week, sessions: SessionInput[], planWeeks: number) {
  if (planWeeks >= 10 || sessions.some((s) => s.type === 'race')) return []
  const hard = (b: SessionInput['blocks'][number]): boolean =>
    'steps' in b && Array.isArray(b.steps) ? b.steps.some(hard as never) : 'zone' in b && typeof b.zone === 'number' && b.zone >= 4
  const quality = sessions.filter((s) => (s.type === 'interval' || s.type === 'tempo') && s.blocks.some(hard))
  return quality.length
    ? []
    : [`Semaine ${week.number} : aucune séance de qualité (type interval ou tempo avec un bloc work en zone 4 ou 5). Sur un plan de ${planWeeks} semaines, chaque semaine doit en avoir au moins une, même une semaine plus légère : remplace une sortie facile par un fractionné ou un seuil (type interval ou tempo), en gardant le volume de la semaine.`]
}

export function checkVolumes(weeks: Skeleton['weeks'], current: number | null) {
  const errors: string[] = []
  const first = weeks[0]
  if (current && first) {
    if (first.targetKm < current * 0.85) {
      errors.push(`Semaine 1 : ${first.targetKm} km est trop bas, le coureur fait déjà ${current} km/semaine. Vise au moins ${Math.round(current * 0.9)} km.`)
    }
    if (first.targetKm > current * 1.15) {
      errors.push(`Semaine 1 : ${first.targetKm} km est trop haut pour un volume actuel de ${current} km. Vise au plus ${Math.round(current * 1.1)} km.`)
    }
  }
  let peak = current ?? first?.targetKm ?? 0
  for (const w of weeks.slice(1)) {
    // +10 % par semaine, ou +5 km depuis un petit volume.
    if (w.phase !== 'taper' && w.phase !== 'race' && w.targetKm > Math.max(peak * 1.12 + 2, peak + 6)) {
      errors.push(`Semaine ${w.number} : ${w.targetKm} km dépasse +10 % (ou +5 km) par rapport au plus haut volume précédent (${Math.round(peak)} km).`)
    }
    peak = Math.max(peak, w.targetKm)
  }
  return errors
}

/** Le volume de pointe visé (accepté par le coureur) est atteint, à 10 % près, avant l'affûtage. */
export function checkPeak(weeks: Skeleton['weeks'], peak: number | null) {
  if (!peak) return []
  const max = Math.max(0, ...weeks.filter((w) => w.phase !== 'taper' && w.phase !== 'race').map((w) => w.targetKm))
  return max >= peak * 0.9
    ? []
    : [`La semaine la plus chargée fait ${max} km, alors que le volume de pointe visé est de ${peak} km : monte jusqu'à ${peak} km (à 10 % près) sur la ou les dernières semaines avant l'affûtage, en progressant de +10 % ou jusqu'à +5 km par semaine.`]
}

/** Trail : D+ de la semaine 1 proche de l'actuel, puis +15 % au plus d'une semaine à l'autre (hors affûtage). */
export function checkGains(weeks: Skeleton['weeks'], current: number | null) {
  const errors: string[] = []
  const first = weeks[0]
  if (first && current && first.targetGain > Math.max(current * 1.2, current + 200)) {
    errors.push(`Semaine 1 : ${first.targetGain} m D+ est trop haut, le coureur fait aujourd'hui ${current} m par semaine. Vise au plus ${Math.round(Math.max(current * 1.15, current + 150))} m.`)
  }
  if (weeks.some((w) => w.phase !== 'race' && w.targetGain <= 0)) errors.push('Plan trail : chaque semaine (hors course) doit avoir un targetGain positif.')
  let peak = Math.max(current ?? 0, first?.targetGain ?? 0)
  for (const w of weeks.slice(1)) {
    if (w.phase !== 'taper' && w.phase !== 'race' && w.targetGain > peak * 1.15 + 100) {
      errors.push(`Semaine ${w.number} : ${w.targetGain} m D+ dépasse +10 % par rapport au plus haut D+ précédent (${Math.round(peak)} m).`)
    }
    peak = Math.max(peak, w.targetGain)
  }
  return errors
}

/** Trail : la somme des D+ des séances respecte le D+ de la semaine. */
export function checkWeekGain(week: Week, sessions: SessionInput[], tolerance = 0.2) {
  if (!week.targetGain || sessions.some((s) => s.type === 'race')) return []
  const gain = sessions.reduce((a, s) => a + (s.elevationGain ?? 0), 0)
  if (gain >= week.targetGain * (1 - tolerance) && gain <= week.targetGain * (1 + tolerance)) return []
  const detail = sessions.map((s) => `${s.date} ${s.elevationGain ?? 0} m`).join(', ')
  return [`Semaine ${week.number} : les séances totalisent ${gain} m D+ (${detail}) au lieu de ${week.targetGain} m visés. Ajuste elevationGain (et le contenu des séances) pour être à ±15 %.`]
}

/** La sortie longue pèse au moins 30 % du volume (30 à 40 % visés), hors affûtage et semaine de course. */
export function checkLongRuns(weeks: Skeleton['weeks']) {
  return weeks
    .filter((w) => w.phase !== 'taper' && w.phase !== 'race' && w.targetKm > 0 && w.longRunKm < Math.floor(w.targetKm * 0.3))
    .map(
      (w) =>
        `Semaine ${w.number} : sortie longue de ${w.longRunKm} km pour ${w.targetKm} km, c'est trop court — elle doit représenter 30 à 40 % du volume (au moins ${Math.ceil(w.targetKm * 0.3)} km) et rester la plus longue sortie de la semaine.`,
    )
}

/**
 * Recale une semaine sur la structure : la sortie longue sur sa distance prévue, puis le volume (±10 %) en allongeant
 * ou raccourcissant footings et récups (étapes hors répétitions), sans toucher aux séances de qualité. Modifie les séances en place.
 */
export function fitWeekVolume(week: Week, sessions: SessionInput[], zones: Zone[]) {
  if (!week.targetKm || sessions.some((s) => s.type === 'race')) return
  const km = (s: SessionInput) => sessionTotals({ ...s, id: '' }, zones).meters / 1000
  const long = sessions.find((s) => s.type === 'long')
  if (long && week.longRunKm > 0) {
    const now = km(long)
    if (now < week.longRunKm * 0.9 || now > week.longRunKm * 1.15) scaleSession(long, week.longRunKm - now, zones)
  }
  // Deux passes : les arrondis (minute, 100 m) et les bornes laissent souvent un reste après la première.
  for (let pass = 0; pass < 2; pass++) {
    const total = sessions.reduce((a, s) => a + km(s), 0)
    if (Math.abs(total - week.targetKm) <= week.targetKm * 0.1) return
    const easy = sessions.filter((s) => s.type === 'easy' || s.type === 'recovery' || (!long && s.type === 'long'))
    const scalable = easy.reduce((a, s) => a + km(s), 0)
    if (scalable > 0) easy.forEach((s) => scaleSession(s, ((week.targetKm - total) * km(s)) / scalable, zones))
  }
}

/** Allonge ou raccourcit une séance d'environ `deltaKm` (étapes hors répétitions, ×0,5 à ×1,5), en mettant à jour la distance annoncée dans le titre et la consigne. */
function scaleSession(s: SessionInput, deltaKm: number, zones: Zone[]) {
  const km = () => sessionTotals({ ...s, id: '' }, zones).meters / 1000
  const before = km()
  const steps = s.blocks.reduce((a, x) => a + (x.kind === 'repeat' ? 0 : sessionTotals({ ...s, blocks: [x], id: '' }, zones).meters / 1000), 0)
  if (steps <= 0) return
  const factor = Math.min(1.5, Math.max(0.5, 1 + deltaKm / steps))
  for (const b of s.blocks) {
    if (b.kind === 'repeat') continue
    b.value = b.target === 'distance' ? Math.max(200, Math.round((b.value * factor) / 100) * 100) : Math.max(60, Math.round((b.value * factor) / 60) * 60)
  }
  const after = km()
  const fix = (text: string) =>
    text.replace(/(\d+(?:[.,]\d+)?)\s?km/g, (m, n: string) => {
      const v = Number(n.replace(',', '.'))
      return Math.abs(v - before) <= before * 0.15 ? `${Number.isInteger(v) ? Math.round(after) : after.toFixed(1)} km` : m
    })
  s.title = fix(s.title)
  s.description = fix(s.description)
}

/** Les séances d'une semaine doivent correspondre au volume prévu par la structure (±15 % par défaut). */
export function checkWeekTotals(week: Week, sessions: SessionInput[], zones: Zone[], tolerance = 0.15) {
  // Semaine de course : son volume dépend surtout de la course, la fourchette ne s'applique pas.
  if (!week.targetKm || sessions.some((s) => s.type === 'race')) return []
  const each = sessions.map((s) => ({ s, km: sessionTotals({ ...s, id: '' }, zones).meters / 1000 }))
  const km = each.reduce((a, x) => a + x.km, 0)
  const errors: string[] = []
  if (km < week.targetKm * (1 - tolerance) || km > week.targetKm * (1 + tolerance)) {
    // Détail par séance : sans lui, Claude ne sait pas quelle séance raccourcir ou allonger.
    const detail = each.filter((x) => x.km > 0).map((x) => `${x.s.date} ${x.s.type} ${x.km.toFixed(1)} km`).join(', ')
    const delta = week.targetKm - km
    errors.push(
      `Semaine ${week.number} : les séances totalisent ${km.toFixed(1)} km (estimés avec les zones d’allure) au lieu de ${week.targetKm} km visés (${detail}). ${delta > 0 ? 'Ajoute' : 'Retire'} environ ${Math.abs(delta).toFixed(1)} km en modifiant les durées/distances des sorties faciles ou de la sortie longue, pour être à ±10 %.`,
    )
  }
  if (week.longRunKm > 0) {
    const longest = Math.max(0, ...sessions.filter((s) => s.type === 'long' || s.type === 'race').map((s) => sessionTotals({ ...s, id: '' }, zones).meters / 1000))
    if (longest < week.longRunKm * 0.8) errors.push(`Semaine ${week.number} : la sortie longue fait ${longest.toFixed(1)} km au lieu de ${week.longRunKm} km.`)
    // La sortie longue reste la plus longue sortie de la semaine.
    for (const s of sessions) {
      if (s.type === 'long' || s.type === 'race') continue
      const km = sessionTotals({ ...s, id: '' }, zones).meters / 1000
      if (km > longest + 0.5) errors.push(`Semaine ${week.number} : la séance du ${s.date} (${km.toFixed(1)} km) est plus longue que la sortie longue (${longest.toFixed(1)} km). Raccourcis-la et reporte le volume sur la sortie longue.`)
    }
  }
  return errors
}
