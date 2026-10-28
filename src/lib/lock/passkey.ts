import { fromB64, random, toB64 } from './crypto'

/**
 * Passkey Face ID / Touch ID. On n'utilise pas la signature (pas de serveur pour la vérifier) :
 * seule la sortie de l'extension PRF compte, c'est un secret que seul l'authentificateur peut recalculer.
 */

export async function platformAuthAvailable() {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } }
}

async function getPrf(credentialId: Uint8Array, salt: Uint8Array) {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32) as BufferSource,
      allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const out = (cred?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first
  if (!out) throw new PrfUnsupportedError()
  return out
}

export class PrfUnsupportedError extends Error {
  constructor() {
    super('This browser can’t encrypt with Face ID (PRF extension missing). Your backup PIN still works.')
  }
}

/** Crée le passkey et renvoie son identifiant, son sel PRF et la sortie PRF (2e Face ID si besoin). */
export async function registerPasskey() {
  const salt = random(32)
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Coach COROS' },
      user: { id: random(16) as BufferSource, name: 'coach-coros', displayName: 'Coach COROS' },
      challenge: random(32) as BufferSource,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Passkey creation cancelled.')
  const ext = cred.getClientExtensionResults() as PrfResults
  if (ext.prf?.enabled === false) throw new PrfUnsupportedError()
  const id = new Uint8Array(cred.rawId)
  // Certains systèmes (iOS) ne renvoient la sortie PRF qu'à l'authentification.
  const output = ext.prf?.results?.first ?? (await getPrf(id, salt))
  return { credentialId: toB64(id), salt: toB64(salt), output }
}

export function passkeyPrf(credentialId: string, salt: string) {
  return getPrf(fromB64(credentialId), fromB64(salt))
}
