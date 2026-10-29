import { Hono } from 'hono'
import type { SessionUser } from './auth.js'
import { db } from './db.js'

/**
 * Chaussures du coureur et kilométrage automatique.
 *
 * Chaque paire garde `baseKm` (kilométrage saisi ou figé) et `since` (jour ISO déjà compris dans `baseKm`).
 * Les sorties synchronisées (`run_days`) des jours strictement après `since` s'ajoutent à la paire créditée :
 * la paire `default`, sinon la première en rotation, sinon la première. Une saisie faite le jour d'une sortie
 * est donc supposée l'inclure (pas de double compte) ; une sortie du même jour encore non synchronisée est perdue.
 */

/** Forme rangée dans `answers.shoes` (`km` = `baseKm`, pour ce qui lit encore l'ancien champ). */
type StoredShoe = { brand: string; model: string; km: number; baseKm: number; since: string; rotation: boolean; default: boolean }
/** Forme renvoyée au client : `km` est le total courant calculé. */
export type ShoeOut = StoredShoe & { credited: boolean }

const isoDay = (t: Date | number) => new Date(t).toISOString().slice(0, 10)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const round1 = (n: number) => Math.round(n * 10) / 10

/** Paire qui reçoit les nouvelles sorties. */
export function creditedIndex(shoes: { rotation: boolean; default?: boolean }[]) {
  const d = shoes.findIndex((s) => s.default)
  if (d >= 0) return d
  const r = shoes.findIndex((s) => s.rotation)
  return r >= 0 ? r : shoes.length ? 0 : -1
}

/** Kilomètres synchronisés après `since` (exclu). */
async function kmAfter(userId: string, since: string) {
  const [row] = await db<{ m: number }[]>`
    select coalesce(sum(meters), 0)::float8 m from run_days where user_id = ${userId} and day > ${since}::date`
  return (row?.m ?? 0) / 1000
}

/** Ajoute le total courant et la paire créditée aux paires rangées. */
async function withTotals(userId: string, shoes: StoredShoe[]): Promise<ShoeOut[]> {
  const ci = creditedIndex(shoes)
  const extra = ci >= 0 ? await kmAfter(userId, shoes[ci].since) : 0
  return shoes.map((s, i) => ({ ...s, km: round1(s.baseKm + (i === ci ? extra : 0)), credited: i === ci }))
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v))

/** Remet d'aplomb une paire rangée (anciennes paires sans `baseKm`/`since` : base = km, depuis `fallbackSince`). */
function normalize(raw: Record<string, unknown>, fallbackSince: string): StoredShoe | null {
  const brand = typeof raw.brand === 'string' ? raw.brand : ''
  if (!brand) return null
  const baseKm = Number.isFinite(num(raw.baseKm)) ? num(raw.baseKm) : Number.isFinite(num(raw.km ?? raw.shoeKm)) ? num(raw.km ?? raw.shoeKm) : 0
  const since = typeof raw.since === 'string' && ISO.test(raw.since) ? raw.since : fallbackSince
  return { brand, model: typeof raw.model === 'string' ? raw.model : '', km: baseKm, baseKm, since, rotation: !!raw.rotation, default: !!raw.default }
}

type SessionRow = { id: string; answers: Record<string, unknown>; completed_at: Date | null; updated_at: Date }

/**
 * Paires du coureur avec leur total courant. Les paires d'avant le kilométrage automatique (ou le seul `gear`
 * de l'onboarding) sont migrées et réécrites une fois : base = km saisi, `since` = dernier enregistrement des
 * réponses, pour ne jamais recompter des sorties déjà comprises dans le chiffre saisi.
 */
export async function loadShoes(userId: string, session?: SessionRow | null): Promise<ShoeOut[]> {
  const s =
    session === undefined
      ? (
          await db<SessionRow[]>`
            select id, answers, completed_at, updated_at from onboarding_sessions
            where user_id = ${userId} order by completed_at desc nulls last, updated_at desc limit 1`
        )[0]
      : session
  if (!s) return []
  const a = s.answers ?? {}
  const fallback = isoDay(s.updated_at ?? s.completed_at ?? Date.now())
  const rawList = Array.isArray(a.shoes) ? (a.shoes as Record<string, unknown>[]) : a.gear && typeof a.gear === 'object' ? [a.gear as Record<string, unknown>] : []
  const shoes = rawList.map((r) => (r && typeof r === 'object' ? normalize(r, fallback) : null)).filter((x): x is StoredShoe => !!x)
  const needsMigration = !Array.isArray(a.shoes) ? shoes.length > 0 : rawList.some((r) => !r || typeof r.since !== 'string' || !Number.isFinite(num(r.baseKm)))
  if (needsMigration) {
    // Fige la migration sans toucher `updated_at` (sinon `since` glisserait à chaque lecture).
    await db`update onboarding_sessions set answers = answers || ${db.json({ shoes } as never)} where id = ${s.id}`
  }
  return withTotals(userId, shoes)
}

export const shoeRoutes = new Hono<{ Variables: { user: SessionUser } }>()

/** Paires avec kilométrage courant (aussi incluses dans `/account/overview`). */
shoeRoutes.get('/shoes', async (c) => c.json({ shoes: await loadShoes(c.get('user').id) }))

/**
 * Enregistre la liste des paires depuis Equipment. Le client renvoie `km` (total affiché, éventuellement modifié)
 * avec `baseKm`/`since` reçus : si le total projeté avec ces valeurs et la nouvelle paire créditée vaut toujours
 * `km`, on les garde ; sinon (kilométrage saisi, changement de paire par défaut) la paire est figée : base = km,
 * since = aujourd'hui (jour local du client si fourni).
 */
shoeRoutes.put('/shoes', async (c) => {
  const userId = c.get('user').id
  const body = await c.req.json<{ shoes?: unknown; today?: unknown }>().catch(() => ({ shoes: undefined, today: undefined }))
  if (!Array.isArray(body.shoes) || body.shoes.length > 20) return c.json({ error: 'Invalid shoe list.' }, 400)
  const now = Date.now()
  const today =
    typeof body.today === 'string' && ISO.test(body.today) && Math.abs(Date.parse(body.today) - Date.parse(isoDay(now))) <= 86_400_000 ? body.today : isoDay(now)
  const input: (Omit<StoredShoe, 'km' | 'baseKm' | 'since'> & { km: number; prevBase: number | null; prevSince: string | null })[] = []
  let hasDefault = false
  for (const s of body.shoes as Record<string, unknown>[]) {
    const brand = typeof s?.brand === 'string' ? s.brand.trim().slice(0, 60) : ''
    const km = Number(s?.km)
    if (!brand || !Number.isFinite(km) || km < 0 || km > 10000) return c.json({ error: 'Each pair needs a brand and a mileage between 0 and 10,000 km.' }, 400)
    const prevBase = Number.isFinite(num(s.baseKm)) && num(s.baseKm) >= 0 && num(s.baseKm) <= 10000 ? num(s.baseKm) : null
    const prevSince = typeof s.since === 'string' && ISO.test(s.since) && s.since <= today ? s.since : null
    // Une seule paire par défaut : la première cochée.
    const isDefault: boolean = !!s.default && !hasDefault
    hasDefault ||= isDefault
    input.push({ brand, model: typeof s.model === 'string' ? s.model.trim().slice(0, 80) : '', km: round1(km), rotation: !!s.rotation, default: isDefault, prevBase, prevSince })
  }
  const ci = creditedIndex(input)
  const shoes: StoredShoe[] = []
  for (const [i, s] of input.entries()) {
    const { prevBase, prevSince, km, ...rest } = s
    let keep = false
    if (prevBase !== null && prevSince !== null) {
      const projected = round1(prevBase + (i === ci ? await kmAfter(userId, prevSince) : 0))
      keep = Math.abs(projected - km) < 0.05
    }
    const baseKm = keep ? prevBase! : km
    shoes.push({ ...rest, km: baseKm, baseKm, since: keep ? prevSince! : today })
  }
  const first = shoes[0]
  const gear = first ? { brand: first.brand, model: first.model, shoeKm: Math.round(first.baseKm), rotation: first.rotation } : null
  const [row] = await db<SessionRow[]>`
    update onboarding_sessions set answers = answers || ${db.json({ shoes, gear } as never)}, updated_at = now()
    where id = (
      select id from onboarding_sessions where user_id = ${userId}
      order by completed_at desc nulls last, updated_at desc limit 1
    )
    returning id, answers, completed_at, updated_at`
  if (!row) return c.json({ error: 'Finish onboarding before adding shoes.' }, 404)
  return c.json({ shoes: await withTotals(userId, shoes) })
})
