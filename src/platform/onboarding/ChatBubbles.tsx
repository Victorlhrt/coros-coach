import { CoachAvatar } from './CoachAvatar'

/** Bulles de la conversation avec Pacer : ses répliques, la réponse du coureur, l'indicateur de frappe. */

export function CoachBubble({ children, first }: { children: React.ReactNode; first: boolean }) {
  return (
    <div className="flex animate-[fade-in_300ms_ease-out] items-end gap-2">
      <span className="w-9 shrink-0">{first && <CoachAvatar />}</span>
      <p className="max-w-[85%] rounded-2xl rounded-bl-md border bg-card px-4 py-2.5 text-sm leading-relaxed">{children}</p>
    </div>
  )
}

export function UserBubble({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background text-sm">{children}</p>
}

export function TypingBubble({ avatar }: { avatar: boolean }) {
  return (
    <div className="flex items-end gap-2">
      <span className="w-9 shrink-0">{avatar && <CoachAvatar />}</span>
      <span className="flex gap-1 rounded-2xl rounded-bl-md border bg-card px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
    </div>
  )
}
