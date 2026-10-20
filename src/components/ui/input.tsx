import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Champ au style Arc (le composant Arc impose un label visible ; ici le label reste libre). */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base outline-none transition-colors placeholder:text-[var(--text-muted)] focus-visible:border-foreground disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
