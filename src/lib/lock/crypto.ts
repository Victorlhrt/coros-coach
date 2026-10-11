/** Primitives WebCrypto du verrou : AES-GCM 256, PBKDF2 pour le code, HKDF pour la sortie PRF du passkey. */

const enc = new TextEncoder()
const dec = new TextDecoder()

export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export function toB64(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromB64(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export interface Sealed {
  iv: string
  data: string
}

function aesKey(raw: Uint8Array) {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(keyBytes: Uint8Array, plain: Uint8Array): Promise<Sealed> {
  const iv = random(12)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await aesKey(keyBytes), plain as BufferSource)
  return { iv: toB64(iv), data: toB64(data) }
}

/** Lève une erreur si la clé est mauvaise (l'authentification GCM échoue). */
export async function open(keyBytes: Uint8Array, sealed: Sealed) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(sealed.iv) as BufferSource },
    await aesKey(keyBytes),
    fromB64(sealed.data) as BufferSource,
  )
  return new Uint8Array(plain)
}

export const sealJson = (key: Uint8Array, value: unknown) => seal(key, enc.encode(JSON.stringify(value)))
export const openJson = async <T>(key: Uint8Array, sealed: Sealed) => JSON.parse(dec.decode(await open(key, sealed))) as T

export const PBKDF2_ITERATIONS = 600_000

/** Clé dérivée du code de secours (PBKDF2-SHA256, 600 000 itérations). */
export async function keyFromPin(pin: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, 256)
  return new Uint8Array(bits)
}

/** Clé dérivée de la sortie PRF du passkey (HKDF-SHA256). */
export async function keyFromPrf(prfOutput: ArrayBuffer) {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32) as BufferSource, info: enc.encode('coros-coach vault key') },
    base,
    256,
  )
  return new Uint8Array(bits)
}
