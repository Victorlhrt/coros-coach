import { formatPace } from './format'
import { paceFitsZone } from './repace'
import type { Block, SessionInput, Zone } from './schema'

/** Zones et allure objectif (s/km) : une allure cible doit correspondre à la zone de son étape. */
type PaceRef = { zones: Zone[]; goalPace: number | null }

function checkBlocks(blocks: Block[], where: string, errors: string[], ref: PaceRef) {
  const checkStep = (s: Extract<Block, { kind: 'warmup' | 'work' | 'recovery' | 'cooldown' }>, at: string) => {
    if (s.target === 'distance' && (s.value < 50 || s.value > 60000)) errors.push(`${at} : distance ${s.value} m hors limites (50 à 60000).`)
    if (s.target === 'time' && (s.value < 10 || s.value > 6 * 3600)) errors.push(`${at} : durée ${s.value} s hors limites (10 à 21600).`)
    if (s.zone < 1 || s.zone > 6) errors.push(`${at} : zone ${s.zone} hors limites (1 à 6).`)
    if ((s.paceFast === null) !== (s.paceSlow === null)) errors.push(`${at} : paceFast et paceSlow doivent être tous deux renseignés ou tous deux null.`)
    if (s.paceFast !== null && s.paceSlow !== null) {
      if (s.paceFast < 150 || s.paceSlow > 1200) errors.push(`${at} : allure hors limites (150 à 1200 s/km).`)
      if (s.paceFast > s.paceSlow) errors.push(`${at} : paceFast doit être ≤ paceSlow (plus petit = plus rapide).`)
      else if (!paceFitsZone(s, ref.zones, ref.goalPace)) {
        const z = ref.zones.find((x) => x.zone === s.zone)!
        errors.push(
          `${at} : allure ${formatPace(s.paceFast)}–${formatPace(s.paceSlow)} incohérente avec la zone ${s.zone} (${formatPace(z.paceFast)}–${formatPace(z.paceSlow)} /km). Prends l’allure du tableau des zones, ou l’allure objectif avec la zone qui lui correspond.`,
        )
      }
    }
  }
  blocks.forEach((b, i) => {
    const at = `${where}, bloc ${i + 1}`
    if (b.kind === 'repeat') {
      if (b.repeats < 1 || b.repeats > 20) errors.push(`${at} : repeats doit être entre 1 et 20.`)
      if (b.steps.length === 0) errors.push(`${at} : répétition vide.`)
      b.steps.forEach((s, j) => {
        if (s.kind !== 'work' && s.kind !== 'recovery') errors.push(`${at}.${j + 1} : seules les étapes work et recovery sont permises dans une répétition.`)
        checkStep(s, `${at}.${j + 1}`)
      })
    } else checkStep(b, at)
  })
}

/** Règles d'une séance : structure, limites COROS, allures cohérentes avec les zones et jour autorisé. */
export function validateSessions(sessions: SessionInput[], allowedDates: Set<string>, label: string, ref: PaceRef) {
  const errors: string[] = []
  const runDates = new Map<string, number>()
  for (const s of sessions) {
    const where = `${label} ${s.date} « ${s.title} »`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) errors.push(`${where} : date au format YYYY-MM-DD attendue.`)
    else if (!allowedDates.has(s.date)) errors.push(`${where} : ${s.date} n’est pas un jour disponible de cette période.`)
    if (!s.title.trim() || !s.description.trim()) errors.push(`${where} : titre et description obligatoires.`)
    if (s.type === 'strength') {
      if (s.blocks.length > 0) errors.push(`${where} : un renforcement n’a pas de blocs.`)
      if (!s.strengthMinutes) errors.push(`${where} : strengthMinutes obligatoire pour un renforcement.`)
    } else {
      if (s.blocks.length === 0) errors.push(`${where} : une séance de course doit avoir au moins un bloc.`)
      checkBlocks(s.blocks, where, errors, ref)
      runDates.set(s.date, (runDates.get(s.date) ?? 0) + 1)
    }
  }
  for (const [date, n] of runDates) if (n > 1) errors.push(`${date} : une seule séance de course par jour.`)
  return errors
}
