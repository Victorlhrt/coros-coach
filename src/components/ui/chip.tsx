import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Puce de sélection au style Arc (chip-group) : bordure et fond teintés par l'accent une fois choisie. */
export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'h-10 rounded-full border px-4 text-sm font-medium transition-[color,background-color,border-color,scale] active:scale-[0.97]',
        active
          ? 'border-[color-mix(in_oklab,var(--accent)_42%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_11%,var(--surface))] text-foreground'
          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]',
        className,
      )}
      {...props}
    />
  )
}
