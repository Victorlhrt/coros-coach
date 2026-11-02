import type { Activity } from '@/lib/coros/activities'
import { fetchRecentData } from '@/lib/coros/data'
import { usePlan, type Recap } from '@/lib/store/plan'
import { callStructured } from './claude'
import { addDays } from './dates'
import { formatClock } from './format'
import { describeFeedback } from './feedback'
import { describeTrend, trainingTrend } from './guardrails'
import { isRun, sessionTotals } from './metrics'
import { COACH_SYSTEM, describeGoal } from './prompts'
import { describeActivity, describeLaps } from './review'
import { WeeklyRecapSchema, type Week } from './schema'

/** Dernière semaine du plan terminée avant `now` (le récap porte sur elle). */
export function lastFinishedWeek(weeks: Week[], now: string) {
  return weeks.filter((w) => w.end < now).at(-1)
}

/**
 * Récap IA de la semaine écoulée : plan respecté (séances, splits), ressentis et douleurs, charge et récupération.
 * Lecture seule : rien n'est modifié dans le plan. `activities` : les sorties déjà chargées (COROS, Garmin, Strava).
 */
export async function buildRecap(weekNumber: number, activities: Activity[]): Promise<Recap> {
  const { plan, goal, zones, links, feedback, reviews } = usePlan.getState()
  if (!plan || !goal) throw new Error('Create a plan first.')
  const week = plan.weeks.find((w) => w.number === weekNumber)
  if (!week) throw new Error('Week not found.')

  const linkedIds = new Set<string>()
  const lines = await Promise.all(
    week.sessions.map(async (s) => {
      const t = sessionTotals(s, zones)
      const head = `${s.date} prévu : ${s.type} « ${s.title} » (${(t.meters / 1000).toFixed(1)} km, ${formatClock(t.seconds)}) — ${JSON.stringify(s.blocks)}`
      const fb = feedback[s.id]
      const feeling = `\n  ressenti : ${fb ? describeFeedback(fb) : 'non saisi'}`
      const activity = activities.find((a) => a.labelId === links[s.id]?.labelId)
      if (!activity) return `${head}\n  réalisé : ${s.type === 'strength' && fb ? 'oui (renfo)' : 'NON (aucune activité liée)'}${feeling}`
      linkedIds.add(activity.labelId)
      return `${head}\n  réalisé : ${describeActivity(activity)}${feeling}\n${await describeLaps(activity)}`
    }),
  )
  const extra = activities
    .filter((a) => a.date >= week.start && a.date <= week.end && !linkedIds.has(a.labelId))
    .map((a) => `${a.date} hors plan : ${a.name}, ${describeActivity(a)}`)

  // Récupération, HRV, sommeil, FC de repos et charge de la montre COROS, si elle est connectée.
  const recent = await fetchRecentData().catch(() => ({}) as Record<string, unknown>)
  delete recent.querySportRecords
  const watch = Object.entries(recent)
    .filter(([, v]) => !(v && typeof v === 'object' && 'erreur' in v))
    .map(([tool, v]) => `### ${tool}\n${JSON.stringify(v).slice(0, 6000)}`)
    .join('\n\n')

  const runs = week.sessions.filter(isRun)
  const doneRuns = runs.filter((s) => links[s.id]?.labelId)
  const weekActs = activities.filter((a) => a.date >= week.start && a.date <= week.end)
  const ratings = week.sessions.map((s) => feedback[s.id]).filter((f) => !!f)
  const stats: Recap['stats'] = {
    done: week.sessions.filter((s) => links[s.id]?.labelId || (s.type === 'strength' && feedback[s.id])).length,
    planned: week.sessions.length,
    km: Math.round(weekActs.reduce((a, x) => a + (x.meters ?? 0), 0) / 100) / 10,
    plannedKm: Math.round(runs.reduce((a, s) => a + sessionTotals(s, zones).meters, 0) / 100) / 10,
    avgRpe: ratings.length ? Math.round((ratings.reduce((a, f) => a + f.rpe, 0) / ratings.length) * 10) / 10 : null,
    rated: ratings.length,
    pain: ratings.filter((f) => f.tags.includes('Douleur') || /douleur|mal |pain|hurt|bless/i.test(f.comment)).length,
  }
  const now = addDays(week.end, 1)

  const recap = await callStructured({
    system: COACH_SYSTEM,
    prompt: `${describeGoal(goal)}

Récap de la semaine ${week.number}/${plan.weeks.length} (${week.phase}, du ${week.start} au ${week.end}) : ${week.focus}. Volume visé ${week.targetKm} km.
Chiffres : ${stats.done}/${stats.planned} séances faites (${doneRuns.length}/${runs.length} sorties), ${stats.km} km courus pour ${stats.plannedKm} km prévus.

Prévu vs réalisé, avec les splits et le ressenti du coureur :
${[...lines, ...extra].join('\n') || 'Aucune séance prévue ni réalisée.'}

${watch ? `Données de la montre (7 derniers jours) :\n${watch}\n\n` : ''}${describeTrend(trainingTrend(plan, links, feedback, reviews, zones, now))}

Écris le récap de cette semaine pour le coureur, comme son coach :
- plan : a-t-il fait les séances, et surtout respecté leur structure (répétitions, allures cibles d'après les splits) ? Cite les séances par leur jour ;
- ressentis : c'est le plus important, appuie-toi sur les notes, RPE, sensations et commentaires ; un RPE élevé sur une séance facile est un signal ;
- douleurs : toute douleur signalée est prise au sérieux (conduite à tenir, consulter si elle persiste) ;
- charge : volume réel vs prévu, tendance, récupération si la montre la donne.
Sois concret et bref, sans répéter les chiffres déjà affichés à côté. N'invente rien : si une donnée manque, dis-le simplement.`,
    schema: WeeklyRecapSchema,
    maxTokens: 4000,
  })
  return { createdAt: new Date().toISOString(), recap, stats }
}
