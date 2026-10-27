import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Surface des panneaux de l'espace coureur : fond carte, bordure fine, grand rayon, sans ombre. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[24px] border bg-card p-5 text-card-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[17px] font-medium tracking-tight', className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}
