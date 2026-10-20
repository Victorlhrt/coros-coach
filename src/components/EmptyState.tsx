import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState as ArcEmptyState } from '@/components/arc/empty-state/empty-state'

/** État vide Arc ; le texte passe en description, une action éventuelle sous le texte. */
export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: string; action?: ReactNode }) {
  return <ArcEmptyState icon={<Icon width={24} height={24} strokeWidth={1.5} />} title={title} description={children ?? ''} action={action} />
}
