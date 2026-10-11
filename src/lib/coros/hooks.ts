import { useQuery } from '@tanstack/react-query'
import { listTools } from './client'
import { useCorosAuth } from './auth-store'

export function useCorosTools() {
  const connected = useCorosAuth((s) => s.connected)
  return useQuery({
    queryKey: ['coros', 'tools'],
    queryFn: listTools,
    enabled: connected,
    staleTime: 60 * 60 * 1000,
  })
}
