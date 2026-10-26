import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Titre de page du back office, avec actions à droite. */
export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading font-medium text-2xl tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Panneau à bordure fine, dans l'esprit des séparateurs Efferd. */
export function Panel({ title, description, actions, className, children }: { title?: string; description?: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 md:p-5', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-medium text-sm">{title}</h2>}
            {description && <p className="mt-0.5 text-muted-foreground text-xs">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
      {error instanceof Error ? error.message : String(error)}
    </p>
  )
}
