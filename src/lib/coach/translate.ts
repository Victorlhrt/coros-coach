import { useEffect } from 'react'
import { z } from 'zod'
import { usePlan } from '@/lib/store/plan'
import { callStructured } from './claude'
import type { Plan } from './schema'

/**
 * Les plans générés avant le passage à l'anglais ont leurs textes en français (nom, présentation, stratégie,
 * focus des semaines, titres et consignes des séances, bilans). On les traduit une fois, sans toucher au reste
 * (dates, allures, structure), puis on marque le plan comme anglais.
 */

type Translatable = Plan & { lang?: 'en' }

const FRENCH = /\b(le|la|les|des|du|une|et|avec|pour|semaine|séance|sortie|allure|footing|récup|fractionné|seuil|course|objectif)\b|[éèêàùç]/gi

/** Texte nettement français : plusieurs mots ou accents typiques. */
const looksFrench = (texts: string[]) => texts.join(' ').match(FRENCH)?.length ?? 0

function collect(plan: Plan, reviews: ReturnType<typeof usePlan.getState>['reviews']) {
  const texts: string[] = [plan.name, plan.overview, plan.raceStrategy ?? '']
  for (const w of plan.weeks) {
    texts.push(w.focus)
    for (const s of w.sessions) texts.push(s.title, s.description)
  }
  for (const r of Object.values(reviews)) {
    texts.push(r.adjustment.summary)
    for (const c of r.adjustment.changes) texts.push(c.reason)
  }
  return texts
}

let running = false

async function translatePlan() {
  const { plan, reviews } = usePlan.getState()
  if (!plan || (plan as Translatable).lang === 'en' || running) return
  const texts = collect(plan, reviews)
  // Rien de français (plan déjà en anglais) : on marque simplement le plan.
  if (looksFrench(texts) < 6) {
    usePlan.setState({ plan: { ...plan, lang: 'en' } as Plan })
    return
  }
  running = true
  try {
    const unique = [...new Set(texts.filter((t) => t.trim()))]
    const { items } = await callStructured({
      system:
        'Tu traduis des textes d’un plan d’entraînement de course à pied du français vers l’anglais. Ton direct et bienveillant, tutoiement → « you ». ' +
        'Garde tels quels les nombres, allures (min/km), distances, durées, dates et noms propres (courses, lieux). ' +
        'Un texte déjà en anglais est renvoyé tel quel. Réponds dans le même ordre, un élément par texte.',
      prompt: `Traduis ces ${unique.length} textes :\n\n${JSON.stringify(unique)}`,
      schema: z.object({ items: z.array(z.string()) }),
      validate: (v) => (v.items.length === unique.length ? [] : [`Il faut exactement ${unique.length} éléments, dans le même ordre (reçu ${v.items.length}).`]),
      maxTokens: 64000,
    })
    const map = new Map(unique.map((t, i) => [t, items[i]]))
    const tr = (t: string) => map.get(t) ?? t
    // Le plan a pu changer pendant la traduction : on ne remplace que s'il s'agit toujours du même.
    const now = usePlan.getState()
    if (now.plan?.id !== plan.id) return
    const next: Translatable = {
      ...now.plan,
      lang: 'en',
      name: tr(now.plan.name),
      overview: tr(now.plan.overview),
      raceStrategy: now.plan.raceStrategy && tr(now.plan.raceStrategy),
      weeks: now.plan.weeks.map((w) => ({ ...w, focus: tr(w.focus), sessions: w.sessions.map((s) => ({ ...s, title: tr(s.title), description: tr(s.description) })) })),
    }
    const nextReviews = Object.fromEntries(
      Object.entries(now.reviews).map(([k, r]) => [
        k,
        { ...r, adjustment: { ...r.adjustment, summary: tr(r.adjustment.summary), changes: r.adjustment.changes.map((c) => ({ ...c, reason: tr(c.reason) })) } },
      ]),
    )
    usePlan.setState({ plan: next, reviews: nextReviews })
  } catch {
    // Réessayé à la prochaine ouverture.
  } finally {
    running = false
  }
}

/** Traduit en arrière-plan un plan resté en français. */
export function usePlanEnglish() {
  const planId = usePlan((s) => s.plan?.id)
  useEffect(() => {
    if (planId) void translatePlan()
  }, [planId])
}
