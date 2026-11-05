import { Star } from 'lucide-react'
import { useState } from 'react'
import { FEELING_TAG_LABEL, FEELING_TAGS, RPE_LABELS, type Feedback, type FeelingTag } from '@/lib/coach/feedback'
import { usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './arc/dialog/dialog'
import { Chip } from './ui/chip'

/**
 * Ressenti d'une séance réalisée : une ligne compacte en haut de la séance (« How it felt » + note si remplie),
 * le formulaire s'ouvre dans une modale. `openOnMount` l'ouvre directement (lien #ressenti).
 */
export function FeedbackCard({ sessionId, openOnMount }: { sessionId: string; openOnMount?: boolean }) {
  const saved = usePlan((s) => s.feedback[sessionId])
  const [open, setOpen] = useState<boolean>(!!openOnMount && !saved)

  return (
    <section id="ressenti" className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border bg-card px-5 py-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <p className="font-medium text-sm">How it felt</p>
        {saved && (
          <>
            <Stars value={saved.rating} />
            <span className="text-muted-foreground text-sm">
              RPE {saved.rpe}/10 · {RPE_LABELS[saved.rpe]}
              {saved.tags.length > 0 && ` · ${saved.tags.map((t) => FEELING_TAG_LABEL[t as FeelingTag] ?? t).join(', ')}`}
            </span>
          </>
        )}
      </div>
      <Button size="sm" variant={saved ? 'secondary' : 'default'} onClick={() => setOpen(true)}>
        {saved ? 'Edit' : 'Complete'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="How it felt" description="Your coach reads this to adjust the next sessions.">
          {open && <FeedbackForm sessionId={sessionId} onSaved={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function FeedbackForm({ sessionId, onSaved }: { sessionId: string; onSaved: () => void }) {
  const saved = usePlan((s) => s.feedback[sessionId])
  const setFeedback = usePlan((s) => s.setFeedback)
  const [draft, setDraft] = useState<Omit<Feedback, 'at'>>(saved ?? { rating: 0, rpe: 5, tags: [], comment: '' })

  const toggleTag = (t: string) =>
    setDraft((d) => ({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] }))

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">Rating</p>
      <Stars value={draft.rating} onChange={(rating) => setDraft((d) => ({ ...d, rating }))} size="lg" />

      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-sm font-medium text-muted-foreground">Perceived effort</p>
        <p className="text-sm font-medium">
          {draft.rpe}/10 · {RPE_LABELS[draft.rpe]}
        </p>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={draft.rpe}
        onChange={(e) => setDraft((d) => ({ ...d, rpe: Number(e.target.value) }))}
        className="mt-2 w-full accent-[var(--accent)]"
        aria-label="Perceived effort from 1 to 10"
      />

      <p className="mt-4 mb-2 text-sm font-medium text-muted-foreground">How you felt</p>
      <div className="flex flex-wrap gap-2">
        {FEELING_TAGS.map((t) => (
          <Chip key={t} active={draft.tags.includes(t)} onClick={() => toggleTag(t)} className="h-9 px-3 text-xs">
            {FEELING_TAG_LABEL[t]}
          </Chip>
        ))}
      </div>

      <textarea
        className="mt-4 h-20 w-full rounded-xl border border-border bg-background p-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        placeholder="Comment (pain, weather, terrain…)"
        value={draft.comment}
        onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
      />

      <Button
        className="mt-3 w-full"
        disabled={draft.rating === 0}
        onClick={() => {
          setFeedback(sessionId, { ...draft, at: new Date().toISOString() })
          onSaved()
          toast.success('Feedback saved ✓')
        }}
      >
        Save
      </Button>
    </div>
  )
}

function Stars({ value, onChange, size = 'sm' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'lg' }) {
  return (
    <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined} aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={cn(size === 'lg' ? 'size-9' : 'size-5', n <= value ? 'fill-accent text-accent' : 'text-muted-foreground/40')} />
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} out of 5`} onClick={() => onChange(n)} className="p-0.5 active:scale-90">
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        )
      })}
    </div>
  )
}
