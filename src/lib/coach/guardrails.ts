import type { Review } from '@/lib/store/plan'
import { addDays } from './dates'
import type { Feedback } from './feedback'
import { isRun, sessionTotals } from './metrics'
import type { Adjustment, Plan, Session, Zone } from './schema'

/**
 * Garde-fous du bilan hebdomadaire. Un bon plan est un peu trop ambitieux : en réaliser 80 à 90 %, c'est
 * normal. Une mauvaise semaine n'allège donc que la fin de cette semaine ; seule une tendance sur 3 semaines
 * (ou une douleur) autorise à baisser vraiment, et l'allure seuil ne bouge qu'avec une tendance, par petits
 * pas, au plus une fois toutes les 2 semaines. Le même raisonnement vaut à la hausse.
 */

type Links = Record<string, { labelId?: string | null }>

/** Part du volume prévu réellement couru pour qu'une semaine soit « tenue ». */
const STRUGGLE_BELOW = 0.7
const CRUISE_ABOVE = 0.9
/** Baisse maximale du reste de la semaine sans tendance ni douleur. */
const MAX_WEEK_CUT = 0.2
/** Variation maximale de l'allure seuil par bilan. */
const MAX_THRESHOLD_STEP = 0.03
const THRESHOLD_FREEZE_DAYS = 14

const HARD_TAGS = ['Jambes lourdes', 'Fatigué', 'Allures trop dures', 'Essoufflé']
const EASY_TAGS = ['Allures trop faciles', 'Facile', 'Bonnes sensations']

export interface Trend {
  /** Taux de réalisation (volume) des 3 dernières semaines terminées, la plus ancienne d'abord. */
  completion: number[]
  pain: boolean
  struggling: boolean
  cruising: boolean
  thresholdFrozen: boolean
}

const done = (s: Session, links: Links) => !!links[s.id]?.labelId

export function trainingTrend(plan: Plan, links: Links, feedback: Record<string, Feedback>, reviews: Record<number, Review>, zones: Zone[], now: string): Trend {
  const past = plan.weeks.filter((w) => w.end < now).slice(-3)
  const completion = past.map((w) => {
    const runs = w.sessions.filter(isRun)
    const planned = runs.reduce((a, s) => a + sessionTotals(s, zones).meters, 0)
    const ran = runs.filter((s) => done(s, links)).reduce((a, s) => a + sessionTotals(s, zones).meters, 0)
    return planned ? Math.round((ran / planned) * 100) / 100 : 1
  })
  const sessions = past.flatMap((w) => w.sessions)
  const tags = sessions.flatMap((s) => feedback[s.id]?.tags ?? [])
  const lastWeek = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date >= addDays(now, -7) && s.date < now)
  const hard = tags.filter((t) => HARD_TAGS.includes(t)).length
  const easy = tags.filter((t) => EASY_TAGS.includes(t)).length
  const frozenSince = addDays(now, -THRESHOLD_FREEZE_DAYS)
  return {
    completion,
    pain: lastWeek.some((s) => feedback[s.id]?.tags.includes('Douleur')),
    struggling: completion.length === 3 && completion.every((c) => c < STRUGGLE_BELOW),
    cruising: completion.length === 3 && completion.every((c) => c >= CRUISE_ABOVE) && easy >= 2 && hard === 0,
    thresholdFrozen: Object.values(reviews).some((r) => r.status === 'applied' && r.adjustment.newThresholdPace !== null && r.createdAt.slice(0, 10) >= frozenSince),
  }
}

/** Consignes ajoutées au prompt du bilan. */
export function describeTrend(t: Trend) {
  const pct = t.completion.map((c) => `${Math.round(c * 100)} %`).join(', ') || 'pas encore de semaine terminée'
  return `Philosophie du plan : il est volontairement exigeant ; réaliser 80 à 90 % du volume est normal et ne justifie aucune baisse. Ne réduis pas le plan à cause d'une seule semaine ratée : déplace, raccourcis une séance de qualité ou remplace-la par une sortie facile, mais garde l'essentiel du volume de la semaine (baisse de ${Math.round(MAX_WEEK_CUT * 100)} % maximum du volume restant), sauf douleur ou tendance confirmée.
Réalisation des 3 dernières semaines terminées (volume couru / prévu) : ${pct}.
${t.pain ? '- Douleur signalée cette semaine : la santé passe avant tout, tu peux alléger autant que nécessaire.' : ''}
${t.struggling ? '- Tendance confirmée : 3 semaines sous 70 %. Le plan est trop chargé pour ce coureur en ce moment : tu peux alléger franchement la semaine et, si les splits le confirment, ralentir l’allure seuil (3 % maximum).' : ''}
${t.cruising ? '- Tendance confirmée : 3 semaines tenues à 90 % et plus avec des séances jugées faciles. Tu peux durcir la semaine et, si les splits le confirment, accélérer l’allure seuil (3 % maximum).' : ''}
${t.thresholdFrozen ? '- L’allure seuil a déjà été modifiée il y a moins de 2 semaines : newThresholdPace doit être null.' : '- Sans tendance confirmée, ne change l’allure seuil que si les splits de plusieurs séances de qualité le montrent clairement, et de 3 % maximum.'}`
    .replace(/\n{2,}/g, '\n')
}

const thresholdOf = (zones: Zone[]) => {
  const z4 = zones.find((z) => z.zone === 4)
  return z4 ? z4.paceFast / 0.99 : null
}

/** Erreurs renvoyées à Claude si l'ajustement franchit un garde-fou. */
export function checkAdjustment(a: Adjustment, t: Trend, remaining: Session[], zones: Zone[]) {
  const errors: string[] = []
  const meters = (list: Session[]) => list.filter(isRun).reduce((acc, s) => acc + sessionTotals(s, zones).meters, 0)
  const before = meters(remaining)
  const after = meters([
    ...remaining.filter((s) => !a.changes.some((c) => c.date === s.date && c.action !== 'add')),
    ...a.changes.flatMap((c) => (c.session ? [{ ...c.session, id: c.date }] : [])),
  ])
  if (!t.pain && !t.struggling && before > 0 && after < before * (1 - MAX_WEEK_CUT)) {
    errors.push(
      `Le volume restant de la semaine passe de ${(before / 1000).toFixed(1)} à ${(after / 1000).toFixed(1)} km : sans douleur ni tendance sur 3 semaines, garde au moins ${((before * (1 - MAX_WEEK_CUT)) / 1000).toFixed(1)} km.`,
    )
  }
  const pace = a.newThresholdPace
  const current = thresholdOf(zones)
  if (pace !== null && current) {
    const step = (pace - current) / current
    if (t.thresholdFrozen) errors.push('L’allure seuil a changé il y a moins de 2 semaines : newThresholdPace doit être null.')
    else if (Math.abs(step) > MAX_THRESHOLD_STEP) errors.push(`newThresholdPace varie de ${Math.round(step * 1000) / 10} % : 3 % maximum (entre ${Math.round(current * 0.97)} et ${Math.round(current * 1.03)} s/km).`)
    else if (step > 0 && !t.struggling) errors.push('Ralentir l’allure seuil demande une tendance confirmée sur 3 semaines : newThresholdPace doit être null.')
  }
  return errors
}
