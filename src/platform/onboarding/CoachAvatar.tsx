import { cn } from '@/lib/utils'

/**
 * Pacer, le coach de l'onboarding : le lièvre de l'équipe d'agents (design system Paper, page Agents),
 * spécialiste de l'allure. Tuile ambrée, tête ronde, deux grandes oreilles et des traits de vitesse.
 */
export function CoachAvatar({ className }: { className?: string }) {
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-[#FFB020]/30 bg-[#FFB020]/12', className)}>
      <svg aria-hidden="true" className="size-[80%]" fill="none" viewBox="0 0 100 100">
        <rect fill="#FFB020" height="38" rx="6" transform="rotate(-16 40 46)" width="12" x="34" y="8" />
        <rect fill="#FFE2A6" height="24" rx="2.5" transform="rotate(-16 40 46)" width="5" x="37.5" y="14" />
        <rect fill="#FFB020" height="40" rx="6" transform="rotate(10 60 46)" width="12" x="54" y="6" />
        <rect fill="#FFE2A6" height="26" rx="2.5" transform="rotate(10 60 46)" width="5" x="57.5" y="12" />
        <circle cx="50" cy="62" fill="#FFB020" r="26" />
        <ellipse cx="40" cy="59" fill="#fff" rx="6" ry="7" />
        <ellipse cx="59" cy="59" fill="#fff" rx="6" ry="7" />
        <circle cx="42.5" cy="60" fill="#1A1206" r="3" />
        <circle cx="61.5" cy="60" fill="#1A1206" r="3" />
        <path d="M47.5 69.5h5l-2.5 3z" fill="#1A1206" />
        <circle cx="33" cy="70" fill="#FF8A3D" fillOpacity="0.55" r="3.5" />
        <circle cx="67" cy="70" fill="#FF8A3D" fillOpacity="0.55" r="3.5" />
      </svg>
    </span>
  )
}
