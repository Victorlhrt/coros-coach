import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { Panel, PanelFooter, PanelHeader, PanelSection } from './panel'

export type PickerSession = { id: string; primary: string; title: string; subtitle?: string; color: string; intensity: 1 | 2 | 3; done?: boolean }

export type PickerDay = {
  /** Clé AAAA-MM-JJ. */
  key: string
  weekday: string
  day: number
  caption: string
  isToday?: boolean
  /** Atténue la tuile (jour hors plan). */
  outside?: boolean
  sessions: PickerSession[]
}

export interface WeekPickerProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  days: PickerDay[]
  selected: string
  onSelect: (key: string) => void
  dateLabel: (key: string) => string
  legend?: { label: string; color: string }[]
  onOpenSession?: (id: string) => void
  footerCaption?: string
  footerSummary?: string
  footerAction?: ReactNode
  className?: string
}

/** Sélecteur de semaine d'entraînement façon Arc « Availability picker ». */
export function WeekPicker({
  title,
  subtitle,
  actions,
  days,
  selected,
  onSelect,
  dateLabel,
  legend,
  onOpenSession,
  footerCaption,
  footerSummary,
  footerAction,
  className,
}: WeekPickerProps) {
  const reduce = useReducedMotion()
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selIndex = Math.max(0, days.findIndex((d) => d.key === selected))
  const day = days[selIndex] as PickerDay | undefined

  // Flèches gauche/droite : déplace la sélection et le focus (motif radiogroup)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (selIndex + 1) % days.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (selIndex - 1 + days.length) % days.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = days.length - 1
    if (next < 0 || days.length === 0) return
    e.preventDefault()
    onSelect(days[next].key)
    tileRefs.current[next]?.focus()
  }

  return (
    <Panel className={className}>
      <PanelHeader title={title} subtitle={subtitle} actions={actions} />

      <div className="px-6 pb-5">
        <div role="radiogroup" aria-label="Jours de la semaine" onKeyDown={onKeyDown} className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((d, i) => {
            const isSel = i === selIndex
            return (
              <button
                key={d.key}
                ref={(el) => {
                  tileRefs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={isSel}
                aria-label={`${dateLabel(d.key)} · ${d.caption}`}
                tabIndex={isSel ? 0 : -1}
                onClick={() => onSelect(d.key)}
                className={cn(
                  'relative flex min-w-0 flex-col items-center overflow-hidden rounded-2xl border px-1 pt-2.5 pb-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pt-3',
                  isSel ? 'border-foreground/40 bg-foreground/[0.12]' : 'hover:bg-foreground/[0.04]',
                  d.outside && !isSel && 'opacity-45',
                )}
              >
                {d.isToday && <span aria-hidden className="absolute top-2 right-2 size-1.5 rounded-full bg-foreground" />}
                <span className={cn('text-xs', isSel ? 'text-foreground' : 'text-muted-foreground')}>{d.weekday}</span>
                <span className="mt-0.5 font-medium text-xl tabular-nums tracking-tight sm:text-2xl">{d.day}</span>
                <span className="mt-0.5 hidden max-w-full truncate text-[11px] text-muted-foreground sm:block">{d.caption}</span>
                <span aria-hidden className="mt-2 flex h-1 w-full justify-center gap-1 px-1.5">
                  {d.sessions.map((s) => (
                    <span key={s.id} className="h-full max-w-6 flex-1 rounded-full" style={{ background: s.color }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <PanelSection divided>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-[15px] first-letter:uppercase">{day ? dateLabel(day.key) : ''}</h3>
          {legend && legend.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
              {legend.map((l) => (
                <li key={l.label} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-3 w-1 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={day?.key ?? 'none'}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduce ? 0.1 : 0.18, ease: 'easeOut' }}
          >
            {day && day.sessions.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {day.sessions.map((s) => (
                  <SessionCard key={s.id} session={s} onOpen={onOpenSession} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-foreground/[0.02] px-4 py-4 text-muted-foreground text-sm">
                <span className="font-medium text-foreground">Jour de repos</span> · La récupération fait partie de l'entraînement.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </PanelSection>

      {(footerCaption || footerSummary || footerAction) && (
        <PanelFooter>
          <div className="min-w-0">
            {footerCaption && <div className="text-muted-foreground text-xs">{footerCaption}</div>}
            {footerSummary && <div className="font-medium text-sm tabular-nums">{footerSummary}</div>}
          </div>
          {footerAction}
        </PanelFooter>
      )}
    </Panel>
  )
}

/** Carte de séance : libellé principal, titre, intensité en barres verticales, coche si faite. */
function SessionCard({ session: s, onOpen }: { session: PickerSession; onOpen?: (id: string) => void }) {
  const body = (
    <>
      <span className="w-16 shrink-0 font-medium text-[15px] tabular-nums tracking-tight">{s.primary}</span>
      <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: s.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">{s.title}</span>
        {s.subtitle && <span className="block truncate text-muted-foreground text-xs">{s.subtitle}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span className="flex items-end gap-[3px]" role="img" aria-label={`Intensité ${s.intensity} sur 3`}>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={cn('w-[3px] rounded-full', n > s.intensity && 'bg-foreground/15')}
              style={{ height: 6 + n * 3, background: n <= s.intensity ? s.color : undefined }}
            />
          ))}
        </span>
        {s.done && <Check className="size-4 text-emerald-400" aria-label="Faite" />}
      </span>
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors'
  if (!onOpen) return <div className={cls}>{body}</div>
  return (
    <button type="button" onClick={() => onOpen(s.id)} className={cn(cls, 'hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
      {body}
    </button>
  )
}
