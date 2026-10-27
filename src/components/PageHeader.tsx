import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 pb-6">
      <div>
        {subtitle && <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>}
        <h1 className="font-heading text-2xl font-medium tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  )
}
