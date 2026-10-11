import { callStructured } from './claude'
import { WEEKDAYS, addDays, today, weekday } from './dates'
import { COACH_SYSTEM, describeGoal, describeProfile, describeZones } from './prompts'
import { AdjustmentSchema, type Adjustment, type Goal, type Plan, type Profile, type Session, type Zone } from './schema'
import { validateSessions } from './validate'

function describeSession(s: Session) {
  return JSON.stringify({ date: s.date, type: s.type, title: s.title, description: s.description, blocks: s.blocks, strengthMinutes: s.strengthMinutes })
}

/** Propose des modifications pour le reste de la semaine à partir des données des 7 derniers jours. */
export async function proposeAdjustment(params: {
  plan: Plan
  goal: Goal
  profile: Profile | null
  zones: Zone[]
  recent: Record<string, unknown>
}): Promise<Adjustment> {
  const { plan, goal, profile, zones, recent } = params
  const from = today()
  const week = plan.weeks.find((w) => w.start <= from && w.end >= from)
  if (!week) throw new Error('Aucune semaine du plan ne couvre aujourd’hui.')

  const remaining = week.sessions.filter((s) => s.date >= from)
  const done = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date < from && s.date >= addDays(from, -7))
  const allowed: string[] = []
  for (let d = from; d <= week.end; d = addDays(d, 1)) if (goal.days.includes(weekday(d))) allowed.push(d)

  const dump = Object.entries(recent)
    .map(([tool, value]) => `### ${tool}\n${JSON.stringify(value).slice(0, 12000)}`)
    .join('\n\n')

  return callStructured({
    system: COACH_SYSTEM,
    prompt: `${describeGoal(goal)}

${describeProfile(profile)}

Zones d’allure :
${describeZones(zones)}

Semaine ${week.number}/${plan.weeks.length} (${week.phase}) : ${week.focus}. Volume visé ${week.targetKm} km.

Séances prévues sur les 7 derniers jours :
${done.map(describeSession).join('\n') || 'aucune'}

Séances restantes cette semaine (à partir d’aujourd’hui ${from}) :
${remaining.map(describeSession).join('\n') || 'aucune'}

Données COROS des 7 derniers jours (activités réalisées, récupération, HRV, sommeil, FC repos, charge) :
${dump}

Compare le prévu et le réalisé, évalue la fatigue, puis propose les ajustements nécessaires pour les séances restantes de la semaine.
Dates modifiables : ${allowed.map((d) => `${d} (${WEEKDAYS[weekday(d)]})`).join(', ')}.
- replace : remplace la séance prévue à cette date par "session".
- remove : supprime la séance prévue ce jour (repos).
- add : ajoute une séance un jour sans séance.
Si tout va bien, renvoie une liste de changements vide et dis-le dans summary.`,
    schema: AdjustmentSchema,
    maxTokens: 12000,
    validate: (a) => {
      const errors: string[] = []
      const allowedSet = new Set(allowed)
      for (const c of a.changes) {
        if (!allowedSet.has(c.date)) errors.push(`${c.date} n’est pas une date modifiable.`)
        const existing = remaining.some((s) => s.date === c.date)
        if (c.action === 'remove' && !existing) errors.push(`${c.date} : rien à supprimer ce jour-là.`)
        if (c.action === 'replace' && !existing) errors.push(`${c.date} : pas de séance à remplacer, utilise add.`)
        if (c.action !== 'remove' && !c.session) errors.push(`${c.date} : session obligatoire pour ${c.action}.`)
        if (c.session && c.session.date !== c.date) errors.push(`${c.date} : la date de session doit être identique.`)
      }
      const sessions = a.changes.flatMap((c) => (c.session ? [c.session] : []))
      errors.push(...validateSessions(sessions, allowedSet, 'Ajustement'))
      return errors
    },
  })
}
