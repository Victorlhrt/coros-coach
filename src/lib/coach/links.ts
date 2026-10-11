import { useEffect } from 'react'
import type { Activity } from '@/lib/coros/activities'
import { useActivities } from '@/lib/coros/activity-hooks'
import { allSessions, usePlan, type ActivityLink } from '@/lib/store/plan'
import { today } from './dates'
import { isRun, sessionTotals } from './metrics'
import type { Plan, Session, Zone } from './schema'

/**
 * Liaison automatique : chaque séance de course passée (ou du jour) sans lien prend l'activité COROS
 * du même jour la plus proche en distance. Les liens posés ou retirés à la main ne sont jamais touchés.
 */
export function autoLinks(plan: Plan, activities: Activity[], links: Record<string, ActivityLink>, zones: Zone[]) {
  const used = new Set(Object.values(links).flatMap((l) => (l.labelId ? [l.labelId] : [])))
  const found: Record<string, ActivityLink> = {}
  const now = today()
  for (const s of allSessions(plan)) {
    if (!isRun(s) || s.date > now || links[s.id]) continue
    const planned = sessionTotals(s, zones).meters
    const candidates = activities
      .filter((a) => a.date === s.date && !used.has(a.labelId))
      .sort((a, b) => Math.abs((a.meters ?? 0) - planned) - Math.abs((b.meters ?? 0) - planned))
    const best = candidates[0]
    if (best) {
      found[s.id] = { labelId: best.labelId, sportType: best.sportType, auto: true }
      used.add(best.labelId)
    }
  }
  return found
}

/** À monter une fois : relie les activités dès qu'elles sont chargées (ouverture, pull-to-refresh). */
export function useAutoLink() {
  const { data } = useActivities()
  const plan = usePlan((s) => s.plan)
  useEffect(() => {
    if (!plan || !data) return
    const { links, zones, setLinks } = usePlan.getState()
    const found = autoLinks(plan, data.activities, links, zones)
    if (Object.keys(found).length > 0) setLinks(found)
  }, [plan, data])
}

export function linkedActivity(session: Session, links: Record<string, ActivityLink>, activities: Activity[]) {
  const id = links[session.id]?.labelId
  return id ? (activities.find((a) => a.labelId === id) ?? null) : null
}
