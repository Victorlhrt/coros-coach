import { cn } from '@/lib/utils'

/** Nom du coach, affiché partout dans l'app et l'onboarding. */
export const COACH_NAME = 'Josh'

const SRC = { still: '/coach/josh.webp', idle: '/coach/josh-idle.webp', hello: '/coach/josh-hello.webp' } as const

/**
 * Josh, le coach : portrait pixel art de profil. `still` est l'image fixe (qui s'anime au survol), `idle` boucle
 * l'animation légère, `hello` l'animation en pied pour l'accueil de l'onboarding.
 */
export function CoachAvatar({ className, motion = 'still' }: { className?: string; motion?: keyof typeof SRC }) {
  return (
    <span className={cn('group/coach relative flex size-9 shrink-0 items-end justify-center overflow-hidden rounded-[12px] border bg-foreground/[0.06]', className)}>
      <img src={SRC[motion]} alt={COACH_NAME} draggable={false} className={cn('size-full object-contain object-bottom [image-rendering:pixelated]', motion === 'still' && 'group-hover/coach:hidden')} />
      {motion === 'still' && <img src={SRC.idle} alt="" aria-hidden loading="lazy" className="hidden size-full object-contain object-bottom [image-rendering:pixelated] group-hover/coach:block" />}
    </span>
  )
}
