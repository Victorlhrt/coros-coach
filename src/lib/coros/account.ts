import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '@/platform/api'

/**
 * COROS connecté pendant l'onboarding : les tokens sont sur le serveur du compte, pas dans le coffre du
 * navigateur. L'envoi des séances passe alors par le serveur (outils du calendrier d'entraînement seulement).
 */
export const ACCOUNT_TOOLS = new Set(['queryTrainingPlanLibrary', 'createTrainingPlan', 'updateTrainingPlan'])

export function useCorosAccountConnected() {
  const q = useQuery({
    queryKey: ['coros-account', 'status'],
    queryFn: () =>
      api<{ connected: boolean }>('/account/coros/status').catch((e) => (e instanceof ApiError && e.status === 401 ? { connected: false } : Promise.reject(e))),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  return { connected: q.data?.connected ?? false, loading: q.isPending }
}

export async function callAccountTool(tool: string, args: Record<string, unknown>) {
  return (await api<{ result: unknown }>(`/account/coros/tools/${tool}`, { body: { args } })).result
}
