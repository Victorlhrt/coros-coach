import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'h-10 rounded-full px-4 text-sm font-semibold transition-colors active:scale-[0.97]',
        active ? 'bg-accent text-accent-foreground' : 'bg-muted text-foreground',
        className,
      )}
      {...props}
    />
  )
}
