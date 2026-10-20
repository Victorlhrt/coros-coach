import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Surface Arc : fond, bordure discrète, ombre au repos, rayon de panneau. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 text-card-foreground shadow-[var(--shadow-resting)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-medium tracking-tight', className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}
