import { create } from 'zustand'
import { PBKDF2_ITERATIONS, fromB64, keyFromPin, keyFromPrf, open, openJson, random, seal, sealJson, toB64, type Sealed } from './crypto'
import { passkeyPrf, registerPasskey } from './passkey'

/**
 * Coffre des secrets de l'appareil (tokens et client OAuth COROS). La clé API Anthropic est sur le serveur.
 * Une clé de données aléatoire chiffre le contenu ; elle est elle-même chiffrée par le code de secours
 * et, si le navigateur le permet, par le passkey Face ID (extension PRF).
 * Déverrouillé, le contenu vit en mémoire et les lectures restent synchrones.
 */

const STORAGE_KEY = 'vault.v1'
const FAILS_KEY = 'vault.fails'
/** Anciennes clés en clair, migrées dans le coffre au premier lancement. */
const LEGACY_KEYS = ['coros.tokens', 'coros.client']
/** Ancienne clé API stockée sur l'appareil : effacée à l'ouverture (elle est maintenant sur le serveur). */
const LEGACY_ANTHROPIC_KEY = 'anthropicKey'

interface Wrap {
  salt: string
  sealed: Sealed
}
interface PinWrap extends Wrap {
  iterations: number
}
interface PasskeyWrap extends Wrap {
  credentialId: string
}
type Stored =
  | { mode: 'plain'; data: Record<string, string> }
  | { mode: 'encrypted'; payload: Sealed; pin: PinWrap; passkey: PasskeyWrap | null }

interface VaultState {
  status: 'locked' | 'open'
  encrypted: boolean
  hasPasskey: boolean
}

export const useVault = create<VaultState>(() => ({ status: 'open', encrypted: false, hasPasskey: false }))

let data: Record<string, string> = {}
let dek: Uint8Array | null = null
let stored: Stored | null = null
let writing: Promise<void> = Promise.resolve()
const listeners = new Set<() => void>()

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

/** Écritures sérialisées : chaque modification ré-chiffre le contenu complet. */
function persist() {
  writing = writing.then(async () => {
    if (stored?.mode === 'encrypted') {
      // Verrouillé : jamais de réécriture (et surtout jamais en clair).
      if (!dek) return
      stored = { ...stored, payload: await sealJson(dek, data) }
    } else stored = { mode: 'plain', data }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  })
  return writing
}

const isLocked = () => useVault.getState().status === 'locked'

export const vault = {
  get: (key: string): string | undefined => data[key],
  set(key: string, value: string) {
    if (isLocked() || data[key] === value) return
    data = { ...data, [key]: value }
    void persist()
    listeners.forEach((l) => l())
  },
  remove(key: string) {
    if (isLocked() || !(key in data)) return
    const { [key]: _removed, ...rest } = data
    void _removed
    data = rest
    void persist()
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

function onOpened() {
  useVault.setState({ status: 'open' })
  vault.remove(LEGACY_ANTHROPIC_KEY)
  listeners.forEach((l) => l())
}

/** Au démarrage : lit le coffre, migre les anciennes données en clair, verrouille si chiffré. */
export function initVault() {
  data = {}
  dek = null
  stored = readStored()
  if (!stored) {
    data = {}
    for (const k of LEGACY_KEYS) {
      const v = localStorage.getItem(k)
      if (v !== null) data[k] = v
    }
    stored = { mode: 'plain', data }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  }
  // Jamais de copie en clair hors du coffre, même si une ancienne version en a laissé une.
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k))
  if (stored.mode === 'plain') {
    data = stored.data
    useVault.setState({ encrypted: false, hasPasskey: false })
    onOpened()
  } else {
    useVault.setState({ status: 'locked', encrypted: true, hasPasskey: !!stored.passkey })
  }
}

async function openWith(kek: Uint8Array, wrap: Wrap) {
  if (stored?.mode !== 'encrypted') return
  const key = await open(kek, wrap.sealed)
  data = await openJson<Record<string, string>>(key, stored.payload)
  dek = key
  localStorage.removeItem(FAILS_KEY)
  onOpened()
}

/** Délai croissant après des codes erronés (freine les essais au hasard). */
function failDelay() {
  const fails = Number(localStorage.getItem(FAILS_KEY) ?? 0)
  return Math.min(30_000, fails * fails * 500)
}

export async function unlockWithPin(pin: string) {
  if (stored?.mode !== 'encrypted') return
  const wait = failDelay()
  if (wait) await new Promise((r) => setTimeout(r, wait))
  try {
    await openWith(await keyFromPin(pin, fromB64(stored.pin.salt), stored.pin.iterations), stored.pin)
  } catch {
    localStorage.setItem(FAILS_KEY, String(Number(localStorage.getItem(FAILS_KEY) ?? 0) + 1))
    throw new Error('Wrong PIN.')
  }
}

export async function unlockWithPasskey() {
  if (stored?.mode !== 'encrypted' || !stored.passkey) return
  const output = await passkeyPrf(stored.passkey.credentialId, stored.passkey.salt)
  try {
    await openWith(await keyFromPrf(output), stored.passkey)
  } catch {
    throw new Error('Face ID couldn’t unlock your vault. Use your PIN.')
  }
}

async function pinWrap(pin: string, key: Uint8Array): Promise<PinWrap> {
  const salt = random(16)
  return { salt: toB64(salt), iterations: PBKDF2_ITERATIONS, sealed: await seal(await keyFromPin(pin, salt), key) }
}

/** Active le verrou : nouvelle clé de données, protégée par le code. */
export async function enableLock(pin: string) {
  await writing
  const key = random(32)
  stored = { mode: 'encrypted', payload: await sealJson(key, data), pin: await pinWrap(pin, key), passkey: null }
  dek = key
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  useVault.setState({ encrypted: true, hasPasskey: false })
}

export async function changePin(pin: string) {
  if (stored?.mode !== 'encrypted' || !dek) throw new Error('Lock isn’t enabled.')
  stored = { ...stored, pin: await pinWrap(pin, dek) }
  await persist()
}

/** Ajoute Face ID : la sortie PRF du passkey chiffre aussi la clé de données. */
export async function addPasskey() {
  if (stored?.mode !== 'encrypted' || !dek) throw new Error('Turn on the lock with a PIN first.')
  const { credentialId, salt, output } = await registerPasskey()
  const sealed = await seal(await keyFromPrf(output), dek)
  stored = { ...stored, passkey: { credentialId, salt, sealed } }
  await persist()
  useVault.setState({ hasPasskey: true })
}

export async function removePasskey() {
  if (stored?.mode !== 'encrypted') return
  stored = { ...stored, passkey: null }
  await persist()
  useVault.setState({ hasPasskey: false })
}

export async function disableLock() {
  await writing
  stored = { mode: 'plain', data }
  dek = null
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  useVault.setState({ encrypted: false, hasPasskey: false })
}

/** Verrouiller = recharger : plus rien en mémoire, l'app redémarre sur l'écran de verrouillage. */
export function lockNow() {
  window.location.reload()
}

/** Code et Face ID perdus : on efface les secrets (le plan est conservé). */
export function resetVault() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(FAILS_KEY)
  window.location.reload()
}

/** Verrouillage automatique après `minutes` en arrière-plan. */
export function setupAutoLock(getMinutes: () => number) {
  let hiddenAt: number | null = null
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
    else if (hiddenAt && useVault.getState().encrypted && Date.now() - hiddenAt > getMinutes() * 60_000) lockNow()
    else hiddenAt = null
  })
}
