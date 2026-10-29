import { useQuery } from '@tanstack/react-query'
import { Avatar, type AvatarProps } from '@/components/arc/avatar/avatar'
import { api } from '../api'
import type { CompleteAnswers } from '../onboarding/CompleteOnboarding'
import { useMe } from '../session'

type AvatarOverview = { answers: CompleteAnswers | null; photoUpdatedAt?: string | null }

/** Photo du coureur : celle envoyée depuis le profil, sinon celle confirmée pendant l'onboarding (`answers.photoUrl`). */
export function useRunnerPhoto() {
  const me = useMe().data
  // Même clé que la vue d'ensemble de l'espace coureur : la requête est partagée.
  const overview = useQuery({ queryKey: ['account', 'overview'], queryFn: () => api<AvatarOverview>('/account/overview') })
  const d = overview.data
  if (me && d?.photoUpdatedAt) return { src: `/api/platform/account/photo/${me.id}?v=${Date.parse(d.photoUpdatedAt)}`, uploaded: true }
  return { src: d?.answers?.photoUrl ?? undefined, uploaded: false }
}

/** Avatar du coureur : sa photo, sinon ses initiales. */
export function RunnerAvatar(props: Omit<AvatarProps, 'src'>) {
  const { src } = useRunnerPhoto()
  return <Avatar {...props} src={src} />
}
