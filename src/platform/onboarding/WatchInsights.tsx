import { formatDuration, type Performance } from './estimate'

/**
 * Aperçu de la montre connectée pendant l'onboarding (même forme que server/src/platform/watch-insights.ts) :
 * lu en arrière-plan dès la connexion, il pré-remplit les réponses et Pacer en montre 2 ou 3 chiffres.
 */

export type WatchBest = { label: '5 km' | '10 km' | 'Half' | 'Marathon'; meters: number; seconds: number; date: string | null }
export type WatchInsights = {
  source: 'coros' | 'garmin'
  weeklyKm: number | null
  runsPerWeek: number | null
  longestRunKm: number | null
  since: string | null
  bests: WatchBest[]
  vo2max: number | null
  vo2maxEstimated: boolean
  thresholdPace: number | null
  predictions: { label: WatchBest['label']; seconds: number }[] | null
  usualDays: string[] | null
  longRunDay: string | null
  fetchedAt: string
}

export const watchName = (w: Pick<WatchInsights, 'source'> | null | undefined) => (w?.source === 'garmin' ? 'Garmin' : 'COROS')

export function hasInsights(w: WatchInsights) {
  return w.weeklyKm !== null || w.longestRunKm !== null || w.bests.length > 0 || w.vo2max !== null || w.thresholdPace !== null
}

/** Meilleurs temps de la montre, au format des performances de l'estimation. */
export function watchPerformances(w: WatchInsights | null | undefined): Performance[] {
  return (w?.bests ?? []).map((b) => ({
    label: `${b.label === 'Half' ? 'Half marathon' : b.label} (${watchName(w)})`,
    km: b.meters / 1000,
    elevation: 0,
    seconds: b.seconds,
    date: b.date ?? undefined,
    source: w!.source,
  }))
}

// Daniels : VDOT d'un temps de course (même formule que src/lib/coach/vdot.ts).
const vdot = (meters: number, seconds: number) => {
  const t = seconds / 60
  const v = meters / t
  return (-4.6 + 0.182258 * v + 0.000104 * v * v) / (0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t))
}

const monthOf = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return d.toLocaleDateString('en-GB', { month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}
const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

type Tile = { value: string; label: string }

/** Les 3 chiffres les plus parlants disponibles : volume, meilleur temps, VO2max, puis sortie longue, seuil, fréquence. */
export function insightTiles(w: WatchInsights): Tile[] {
  const best = [...w.bests].sort((a, b) => vdot(b.meters, b.seconds) - vdot(a.meters, a.seconds))[0]
  const tiles: (Tile | null)[] = [
    w.weeklyKm ? { value: `${w.weeklyKm} km`, label: 'per week' } : null,
    best ? { value: formatDuration(best.seconds), label: `${best.label}${best.date ? ` · ${monthOf(best.date)}` : ''}` } : null,
    w.vo2max ? { value: String(Math.round(w.vo2max)), label: w.vo2maxEstimated ? 'VO2max (est.)' : 'VO2max' } : null,
    w.longestRunKm ? { value: `${w.longestRunKm} km`, label: 'longest run' } : null,
    w.thresholdPace ? { value: `${pace(w.thresholdPace)} /km`, label: 'threshold' } : null,
    w.runsPerWeek ? { value: String(w.runsPerWeek), label: 'runs / week' } : null,
  ]
  return tiles.filter((t): t is Tile => t !== null).slice(0, 3)
}

/** Carte de Pacer : 2 ou 3 tuiles monochromes, sans texte. */
export function InsightTiles({ insights }: { insights: WatchInsights }) {
  const tiles = insightTiles(insights)
  return (
    <div className={`grid gap-2 rounded-[20px] border bg-card p-4 text-center ${tiles.length === 3 ? 'grid-cols-3' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {tiles.map((t) => (
        <div key={t.label} className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate font-semibold text-xl tabular-nums tracking-tight">{t.value}</p>
          <p className="truncate text-muted-foreground text-xs">{t.label}</p>
        </div>
      ))}
    </div>
  )
}
