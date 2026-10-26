import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Me } from './api'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: Me | null }>('/auth/me').then((r) => r.user),
    staleTime: 60_000,
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
