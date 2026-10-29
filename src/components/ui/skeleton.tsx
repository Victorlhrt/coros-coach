import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-skeleton rounded-[var(--radius-control)] bg-[var(--surface-muted)]', className)} {...props} />
}
