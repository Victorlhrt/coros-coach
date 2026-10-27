import type { ReactNode } from 'react'

/** Connexion et inscription : le formulaire à droite, une photo de course à gauche sur desktop. */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside aria-hidden="true" className="relative hidden overflow-hidden border-r lg:block">
        <img src="/visuals/login.webp" alt="" className="absolute inset-0 size-full object-cover object-[50%_25%] opacity-80" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
        <p className="absolute bottom-10 left-10 max-w-sm font-heading font-medium text-3xl leading-tight tracking-tight">
          Ton plan, écrit par des agents, synchronisé avec ta montre.
        </p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
