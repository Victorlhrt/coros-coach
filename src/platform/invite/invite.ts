import { api } from '../api'

/** Code d'invitation validé, gardé le temps de la visite. */
export const INVITE_KEY = 'platform.inviteCode'
/** Lien de parrainage de la personne inscrite sur la liste d'attente, pour lui réafficher son rang. */
const WAITLIST_KEY = 'platform.waitlistRef'

const store = {
  get: (k: string, s: () => Storage = () => sessionStorage) => {
    try {
      return s().getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string, s: () => Storage = () => sessionStorage) => {
    try {
      s().setItem(k, v)
    } catch {
      /* sans stockage, on redemandera le code */
    }
  },
  remove: (k: string) => {
    try {
      sessionStorage.removeItem(k)
    } catch {
      /* rien à nettoyer */
    }
  },
}

export const storedInviteCode = () => store.get(INVITE_KEY)
export const forgetInviteCode = () => store.remove(INVITE_KEY)
/** Code déjà validé ailleurs (parcours repris depuis le lien de relance). */
export const rememberInviteCode = (code: string) => store.set(INVITE_KEY, code)

/** Vérifie un code (sans le consommer : l'usage est compté à la fin du parcours). Valide : gardé pour la visite. */
export async function checkInviteCode(code: string): Promise<string | null> {
  const res = await api<{ valid: boolean; code?: string }>('/invites/check', { body: { code } })
  if (!res.valid || !res.code) return null
  store.set(INVITE_KEY, res.code)
  return res.code
}

export type WaitlistStatus = { refCode: string; position: number; total: number; referrals: number; first_name: string }

/** Inscription sur la liste d'attente (avec le `?ref=` d'un ami), rang gardé sur l'appareil. */
export async function joinWaitlist(body: { firstName: string; email: string; ref?: string | null }) {
  const res = await api<WaitlistStatus>('/invites/waitlist', { body: { firstName: body.firstName, email: body.email, ref: body.ref ?? undefined } })
  store.set(WAITLIST_KEY, res.refCode, () => localStorage)
  return res
}

/** Rang de la personne déjà inscrite sur cet appareil (null sinon). */
export async function storedWaitlistStatus(): Promise<WaitlistStatus | null> {
  const ref = store.get(WAITLIST_KEY, () => localStorage)
  if (!ref) return null
  return api<WaitlistStatus>(`/invites/waitlist/${ref}`).catch(() => null)
}

export const waitlistShareUrl = (refCode: string) => `${window.location.origin}/onboarding?ref=${refCode}`
