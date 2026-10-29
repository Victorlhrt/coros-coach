import { useQuery } from '@tanstack/react-query'
import { formatDay } from '@/lib/coach/dates'
import type { Lap } from '@/lib/coros/laps'
import { ApiError, api } from '@/platform/api'
import { GARMIN_PREFIX, type GarminActivity } from './merge'

/** Garmin par la clé Personal API du coureur : tout passe par le serveur (clé chiffrée, jeton 24 h). */

export type GarminStatus = { connected: boolean; expiresAt: string | null; lastSyncAt: string | null; error: string | null }
export type GarminExpiry = 30 | 90 | 180 | 365

/** Page Garmin Connect où créer la clé (passe par la connexion Garmin si besoin). */
export const GARMIN_KEY_URL =
  'https://sso.garmin.com/portal/sso/en-US/sign-in?clientId=GarminConnect&service=https%3A%2F%2Fconnect.garmin.com%2Fapp%2Fsettings%2FpersonalApiToken'

const OFF: GarminStatus = { connected: false, expiresAt: null, lastSyncAt: null, error: null }

export const GARMIN_STATUS_KEY = ['garmin', 'status'] as const

/** État de la connexion Garmin du compte ; hors session plateforme (coach perso), simplement « non connecté ». */
export function useGarminStatus() {
  return useQuery({
    queryKey: GARMIN_STATUS_KEY,
    queryFn: () => api<GarminStatus>('/account/garmin/status').catch((e) => (e instanceof ApiError && e.status === 401 ? OFF : Promise.reject(e))),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useGarminConnected() {
  return useGarminStatus().data?.connected ?? false
}

export function connectGarmin(apiKey: string, expiryDays: GarminExpiry) {
  return api<{ connected: boolean; expiresAt: string | null }>('/account/garmin/connect', { body: { apiKey, expiryDays } })
}

export function connectGarminOnboarding(sessionId: string, apiKey: string, expiryDays: GarminExpiry) {
  return api<{ connected: boolean; expiresAt: string | null }>('/connect/garmin', { body: { sessionId, apiKey, expiryDays } })
}

export function disconnectGarmin() {
  return api<{ connected: boolean }>('/account/garmin/connect', { method: 'DELETE' })
}

export function fetchGarminActivities(days: number) {
  return api<GarminActivity[]>(`/account/garmin/activities?days=${days}`)
}

export function fetchGarminLaps(labelId: string) {
  return api<Lap[]>(`/account/garmin/activities/${encodeURIComponent(labelId.replace(GARMIN_PREFIX, ''))}/laps`)
}

/** Jours restants avant l'expiration de la clé (null si inconnue). */
export function daysLeft(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return null
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) ? Math.floor((t - now) / 86_400_000) : null
}

/** Avertissement de renouvellement à partir de 30 jours avant l'expiration de la clé. */
export const RENEW_WITHIN_DAYS = 30

/** « Expires 29 Oct 2027 » */
export function formatExpiry(iso: string | null | undefined) {
  return iso ? formatDay(iso.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : null
}
