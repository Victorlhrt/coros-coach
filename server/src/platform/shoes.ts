import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { SessionUser } from './auth.js'
import { db } from './db.js'

/**
 * Chaussures du coureur et kilométrage automatique.
 *
 * Chaque paire garde `baseKm` (kilométrage saisi ou figé) et `since` (jour ISO de la saisie).
 * Les sorties synchronisées (`run_days`) des jours à partir de `since` (compris) s'ajoutent à la paire créditée :
 * la paire `default`, sinon la première en rotation, sinon la première. Une sortie du jour de la saisie compte :
 * si le kilométrage saisi l'incluait déjà, elle est comptée deux fois (le coureur corrige à la main).
 *
 * Une activité peut être rattachée à une autre paire (`activity_shoes`, depuis la séance) : sa distance quitte
 * la paire créditée (si elle est après son `since`) et s'ajoute à la paire choisie (si elle est après le `since`
 * de celle-ci). Chaque paire a un `id` stable, attribué à la première lecture et gardé par la sauvegarde.
 */

/** Forme rangée dans `answers.shoes` (`km` = `baseKm`, pour ce qui lit encore l'ancien champ). */
type StoredShoe = { id: string; brand: string; model: string; km: number; baseKm: number; since: string; rotation: boolean; default: boolean }
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

/** Kilomètres synchronisés depuis `since` (compris : une sortie du jour où l'on a saisi le kilométrage compte). */
async function kmAfter(userId: string, since: string) {
  const [row] = await db<{ m: number }[]>`
    select coalesce(sum(meters), 0)::float8 m from run_days where user_id = ${userId} and day >= ${since}::date`
  return (row?.m ?? 0) / 1000
}

type Assignment = { label_id: string; day: string; meters: number; shoe_id: string }

/**
 * Kilomètres à ajouter à `baseKm` pour chaque paire : sorties synchronisées pour la paire créditée, corrigées
 * des activités rattachées à une autre paire, plus ces activités pour la paire choisie.
 */
async function extraKm(userId: string, shoes: { id: string; since: string; rotation: boolean; default?: boolean }[]) {
  const extra = shoes.map(() => 0)
  const ci = creditedIndex(shoes)
  if (ci < 0) return extra
  extra[ci] = await kmAfter(userId, shoes[ci].since)
  const rows = await db<Assignment[]>`
    select label_id, to_char(activity_date, 'YYYY-MM-DD') as day, meters, shoe_id from activity_shoes where user_id = ${userId}`
  for (const r of rows) {
    const j = shoes.findIndex((s) => s.id === r.shoe_id)
    if (j < 0 || j === ci) continue
    if (r.day >= shoes[ci].since) extra[ci] -= r.meters / 1000
    if (r.day >= shoes[j].since) extra[j] += r.meters / 1000
  }
  // Une activité rattachée mais pas encore synchronisée ne doit pas rendre le total négatif.
  extra[ci] = Math.max(0, extra[ci])
  return extra
}

/** Ajoute le total courant et la paire créditée aux paires rangées. */
async function withTotals(userId: string, shoes: StoredShoe[]): Promise<ShoeOut[]> {
  const ci = creditedIndex(shoes)
  const extra = await extraKm(userId, shoes)
  return shoes.map((s, i) => ({ ...s, km: round1(s.baseKm + extra[i]), credited: i === ci }))
}

const SHOE_ID = /^[\w-]{1,64}$/

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v))

/** Remet d'aplomb une paire rangée (anciennes paires sans `baseKm`/`since` : base = km, depuis `fallbackSince`). */
function normalize(raw: Record<string, unknown>, fallbackSince: string): StoredShoe | null {
  const brand = typeof raw.brand === 'string' ? raw.brand : ''
  if (!brand) return null
  const baseKm = Number.isFinite(num(raw.baseKm)) ? num(raw.baseKm) : Number.isFinite(num(raw.km ?? raw.shoeKm)) ? num(raw.km ?? raw.shoeKm) : 0
  const since = typeof raw.since === 'string' && ISO.test(raw.since) ? raw.since : fallbackSince
  const id = typeof raw.id === 'string' && SHOE_ID.test(raw.id) ? raw.id : randomUUID()
  return { id, brand, model: typeof raw.model === 'string' ? raw.model : '', km: baseKm, baseKm, since, rotation: !!raw.rotation, default: !!raw.default }
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
            where user_id = ${userId} and not is_preview order by completed_at desc nulls last, updated_at desc limit 1`
        )[0]
      : session
  if (!s) return []
  const a = s.answers ?? {}
  const fallback = isoDay(s.updated_at ?? s.completed_at ?? Date.now())
  const rawList = Array.isArray(a.shoes) ? (a.shoes as Record<string, unknown>[]) : a.gear && typeof a.gear === 'object' ? [a.gear as Record<string, unknown>] : []
  const shoes = rawList.map((r) => (r && typeof r === 'object' ? normalize(r, fallback) : null)).filter((x): x is StoredShoe => !!x)
  // Deux paires ne partagent jamais un id (copie manuelle, ancienne donnée) : la seconde en reçoit un neuf.
  const seen = new Set<string>()
  let dup = false
  for (const sh of shoes) {
    if (seen.has(sh.id)) {
      sh.id = randomUUID()
      dup = true
    }
    seen.add(sh.id)
  }
  const needsMigration =
    dup ||
    (!Array.isArray(a.shoes)
      ? shoes.length > 0
      : rawList.some((r) => !r || typeof r.since !== 'string' || !Number.isFinite(num(r.baseKm)) || typeof r.id !== 'string' || !SHOE_ID.test(r.id)))
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
  const ids = new Set<string>()
  for (const s of body.shoes as Record<string, unknown>[]) {
    const brand = typeof s?.brand === 'string' ? s.brand.trim().slice(0, 60) : ''
    const km = Number(s?.km)
    if (!brand || !Number.isFinite(km) || km < 0 || km > 10000) return c.json({ error: 'Each pair needs a brand and a mileage between 0 and 10,000 km.' }, 400)
    const prevBase = Number.isFinite(num(s.baseKm)) && num(s.baseKm) >= 0 && num(s.baseKm) <= 10000 ? num(s.baseKm) : null
    const prevSince = typeof s.since === 'string' && ISO.test(s.since) && s.since <= today ? s.since : null
    // Une seule paire par défaut : la première cochée.
    const isDefault: boolean = !!s.default && !hasDefault
    hasDefault ||= isDefault
    // L'id reçu est gardé (rattachements des activités) ; nouvelle paire ou doublon : id neuf.
    const id = typeof s.id === 'string' && SHOE_ID.test(s.id) && !ids.has(s.id) ? s.id : randomUUID()
    ids.add(id)
    input.push({ id, brand, model: typeof s.model === 'string' ? s.model.trim().slice(0, 80) : '', km: round1(km), rotation: !!s.rotation, default: isDefault, prevBase, prevSince })
  }
  // Total projeté de chaque paire avec ses anciennes valeurs, selon la même règle que l'affichage.
  const projectedExtra = await extraKm(userId, input.map((s) => ({ ...s, since: s.prevSince ?? today })))
  const shoes: StoredShoe[] = []
  for (const [i, s] of input.entries()) {
    const { prevBase, prevSince, km, ...rest } = s
    let keep = false
    if (prevBase !== null && prevSince !== null) {
      const projected = round1(prevBase + projectedExtra[i])
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
      select id from onboarding_sessions where user_id = ${userId} and not is_preview
      order by completed_at desc nulls last, updated_at desc limit 1
    )
    returning id, answers, completed_at, updated_at`
  if (!row) return c.json({ error: 'Finish onboarding before adding shoes.' }, 404)
  // Les activités rattachées à une paire supprimée reviennent à la paire par défaut.
  await db`delete from activity_shoes where user_id = ${userId} and not (shoe_id = any(${shoes.map((x) => x.id)}::text[]))`
  return c.json({ shoes: await withTotals(userId, shoes) })
})

const LABEL = /^[\w-]{1,64}$/

/** Paires et chaussure rattachée à chacune des activités demandées (`labels` séparés par des virgules). */
shoeRoutes.get('/activity-shoes', async (c) => {
  const userId = c.get('user').id
  const labels = (c.req.query('labels') ?? '').split(',').map((l) => l.trim()).filter((l) => LABEL.test(l)).slice(0, 200)
  const shoes = await loadShoes(userId)
  const rows = labels.length
    ? await db<{ label_id: string; shoe_id: string }[]>`
        select label_id, shoe_id from activity_shoes where user_id = ${userId} and label_id = any(${labels}::text[])`
    : []
  const known = new Set(shoes.map((s) => s.id))
  const assignments = Object.fromEntries(rows.filter((r) => known.has(r.shoe_id)).map((r) => [r.label_id, r.shoe_id]))
  return c.json({ shoes, assignments })
})

/**
 * Rattache une activité COROS à une paire (`shoeId`), ou la rend à la paire par défaut (`null`). La date et la
 * distance de l'activité sont gardées pour le kilométrage sans relire COROS.
 */
shoeRoutes.put('/activity-shoes/:labelId', async (c) => {
  const userId = c.get('user').id
  const labelId = c.req.param('labelId')
  if (!LABEL.test(labelId)) return c.json({ error: 'Invalid activity.' }, 400)
  const body = await c.req.json<{ shoeId?: unknown; date?: unknown; meters?: unknown }>().catch(() => null)
  if (!body || (body.shoeId !== null && typeof body.shoeId !== 'string')) return c.json({ error: 'Choose a pair.' }, 400)
  if (body.shoeId === null) {
    await db`delete from activity_shoes where user_id = ${userId} and label_id = ${labelId}`
  } else {
    const meters = Number(body.meters)
    if (typeof body.date !== 'string' || !ISO.test(body.date) || !Number.isFinite(meters) || meters < 0 || meters > 500_000)
      return c.json({ error: 'Invalid activity date or distance.' }, 400)
    const shoes = await loadShoes(userId)
    if (!shoes.some((s) => s.id === body.shoeId)) return c.json({ error: 'Unknown pair.' }, 404)
    await db`
      insert into activity_shoes (user_id, label_id, activity_date, meters, shoe_id)
      values (${userId}, ${labelId}, ${body.date}::date, ${Math.round(meters)}, ${body.shoeId})
      on conflict (user_id, label_id) do update
        set activity_date = excluded.activity_date, meters = excluded.meters, shoe_id = excluded.shoe_id, updated_at = now()`
  }
  return c.json({ shoes: await loadShoes(userId), shoeId: body.shoeId })
})
