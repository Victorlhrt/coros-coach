import { useMutation } from '@tanstack/react-query'
import { LogInIcon } from 'lucide-react'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'

/** Ouvre l'espace du coureur en étant connecté à son compte (2 h, bandeau « Back to admin » pour revenir). */
export function OpenRunnerSpace({ userId, name, size = 'sm' }: { userId: string; name: string; size?: 'xs' | 'sm' }) {
  const open = useMutation({
    mutationFn: () => api(`/admin/users/${userId}/impersonate`, { method: 'POST' }),
    // Rechargement complet : le coach repart de l'état du coureur, pas de celui de l'admin.
    onSuccess: () => window.location.assign('/account/home'),
    onError: (err) => window.alert(err instanceof Error ? err.message : String(err)),
  })
  return (
    <Button size={size} variant="secondary" disabled={open.isPending} onClick={() => open.mutate()} title={`Log in as ${name}`}>
      <LogInIcon /> {size === 'xs' ? 'Log in as' : `Log in as ${name.split(' ')[0]}`}
    </Button>
  )
}
