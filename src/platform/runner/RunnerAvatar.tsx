import { useQuery } from '@tanstack/react-query'
import { Avatar, type AvatarProps } from '@/components/arc/avatar/avatar'
import { api } from '../api'
import type { CompleteAnswers } from '../onboarding/CompleteOnboarding'

/** Avatar du coureur : la photo confirmée pendant l'onboarding (`answers.photoUrl`), sinon ses initiales. */
export function RunnerAvatar(props: Omit<AvatarProps, 'src'>) {
  // Même clé que la vue d'ensemble de l'espace coureur : la requête est partagée.
  const overview = useQuery({ queryKey: ['account', 'overview'], queryFn: () => api<{ answers: CompleteAnswers | null }>('/account/overview') })
  const photo = overview.data?.answers?.photoUrl
  return <Avatar {...props} src={photo ?? undefined} />
}
