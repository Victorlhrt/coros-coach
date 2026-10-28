import { ArrowUp, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/arc/badge/badge'
import { Panel, PanelFooter, PanelHeader, PanelSection } from '@/components/raice/panel'
import { allSessions, usePlan } from '@/lib/store/plan'
import { today } from '@/lib/coach/dates'
import { CoachAvatar } from '../onboarding/CoachAvatar'

/**
 * Chat avec Pacer : l'interface est en place (fil, suggestions, champ de saisie) mais l'envoi est
 * désactivé tant que le coach conversationnel n'est pas branché.
 */

const SUGGESTIONS = ['Move tomorrow’s session', 'My calf hurts', 'Busy week at work', 'Can I race this weekend?']

export function CoachChat({ firstName, className }: { firstName?: string; className?: string }) {
  const plan = usePlan((s) => s.plan)
  const now = today()
  const next = plan ? allSessions(plan).find((s) => s.date >= now) : undefined
  const messages: { from: 'coach' | 'me'; text: string }[] = [
    { from: 'coach', text: `Hi${firstName ? ` ${firstName}` : ''}! I’m Pacer, your coach.` },
    plan
      ? { from: 'coach', text: `We’re building towards ${plan.name}.${next ? ` Next up: ${next.title}.` : ''}` }
      : { from: 'coach', text: 'I’m preparing your plan from your answers.' },
    { from: 'me', text: 'Can we move my long run to Sunday?' },
    {
      from: 'coach',
      text: 'Soon you’ll be able to ask me exactly that. Move a session, flag a niggle, tell me your week is packed, and I’ll rework the plan and sync it to your watch.',
    },
  ]
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader
        title={
          <span className="flex items-center gap-3">
            <CoachAvatar className="size-9" />
            <span>
              <span className="block font-medium text-sm">Pacer</span>
              <span className="block font-normal text-muted-foreground text-xs">Your AI coach</span>
            </span>
          </span>
        }
        actions={
          <Badge size="sm" tone="info" icon={<Sparkles className="size-3" />}>
            Coming soon
          </Badge>
        }
      />
      <PanelSection divided className="flex min-h-80 flex-1 flex-col justify-end gap-2.5">
        {messages.map((m, i) => (
          <p
            key={i}
            className={
              m.from === 'coach'
                ? 'w-fit max-w-[85%] rounded-2xl rounded-bl-md border bg-background px-4 py-2.5 text-sm'
                : 'ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#6c7cf5] px-4 py-2.5 text-sm text-white'
            }
          >
            {m.text}
          </p>
        ))}
      </PanelSection>
      <PanelFooter className="flex-col items-stretch gap-3">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {SUGGESTIONS.map((s) => (
            <span key={s} className="shrink-0 cursor-not-allowed rounded-full border px-3 py-1.5 text-muted-foreground text-xs">
              {s}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-[18px] border bg-background p-1.5 pl-4">
          <span className="flex-1 truncate text-muted-foreground text-sm">Chat with Pacer is coming soon…</span>
          <button type="button" disabled aria-label="Send" className="flex size-9 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </PanelFooter>
    </Panel>
  )
}
