import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Panneau de l'espace coureur, dans l'esprit des blocs Arc : surface sombre, bordure fine, grand rayon,
 * en-tête titre + sous-titre + actions, sections séparées par des filets pleine largeur.
 */
export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('animate-blur-in min-w-0 overflow-hidden rounded-[28px] border bg-card text-card-foreground', className)} {...props} />
}

export function PanelHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-5', className)}>
      <div className="min-w-0">
        <h2 className="font-medium text-[17px] leading-snug tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Bloc intérieur ; `divided` trace un filet pleine largeur au-dessus. */
export function PanelSection({ divided, className, ...props }: HTMLAttributes<HTMLDivElement> & { divided?: boolean }) {
  return <div className={cn('px-6 py-5', divided && 'border-t', className)} {...props} />
}

/** Bas de panneau légèrement teinté, pour un résumé et une action (comme le « Confirm time » d'Arc). */
export function PanelFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-between gap-4 border-t bg-foreground/[0.03] px-6 py-4', className)} {...props} />
}

/** Contrôle segmenté compact en pilule (Sort / Bands / 7D-30D-90D des blocs Arc). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border bg-foreground/[0.04] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3 py-1 text-sm transition-colors',
            o.value === value ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
