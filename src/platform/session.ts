import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Me } from './api'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: Me | null }>('/auth/me').then((r) => r.user),
    staleTime: 60_000,
    // Une erreur (serveur en cours de redéploiement, réseau) n'est pas une déconnexion : on réessaie longtemps.
    retry: 8,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 15_000),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return async () => {
    await api('/auth/logout', { method: 'POST' })
    qc.setQueryData(['me'], null)
    qc.clear()
  }
}
