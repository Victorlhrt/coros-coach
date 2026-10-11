import { Star } from 'lucide-react'
import { useState } from 'react'
import { FEELING_TAGS, RPE_LABELS, type Feedback } from '@/lib/coach/feedback'
import { usePlan } from '@/lib/store/plan'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Card, CardDescription, CardTitle } from './ui/card'
import { Chip } from './ui/chip'

/** Note et ressenti d'une séance réalisée. */
export function FeedbackCard({ sessionId }: { sessionId: string }) {
  const saved = usePlan((s) => s.feedback[sessionId])
  const setFeedback = usePlan((s) => s.setFeedback)
  const [editing, setEditing] = useState(!saved)
  const [draft, setDraft] = useState<Omit<Feedback, 'at'>>(saved ?? { rating: 0, rpe: 5, tags: [], comment: '' })

  if (saved && !editing) {
    return (
      <Card id="ressenti">
        <div className="flex items-center justify-between">
          <CardTitle>Mon ressenti</CardTitle>
          <button className="text-sm font-semibold text-accent" onClick={() => setEditing(true)}>
            Modifier
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Stars value={saved.rating} />
          <span className="text-sm font-semibold">
            RPE {saved.rpe}/10 · {RPE_LABELS[saved.rpe]}
          </span>
        </div>
        {saved.tags.length > 0 && <p className="mt-2 text-sm text-muted-foreground">{saved.tags.join(' · ')}</p>}
        {saved.comment && <p className="mt-2 text-sm">« {saved.comment} »</p>}
      </Card>
    )
  }

  const toggleTag = (t: string) =>
    setDraft((d) => ({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] }))

  return (
    <Card id="ressenti">
      <CardTitle>Comment c’était ?</CardTitle>
      <CardDescription className="mt-1">Ton ressenti est pris en compte dans le bilan de la semaine.</CardDescription>

      <p className="mt-4 text-sm font-medium text-muted-foreground">Note</p>
      <Stars value={draft.rating} onChange={(rating) => setDraft((d) => ({ ...d, rating }))} size="lg" />

      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-sm font-medium text-muted-foreground">Effort perçu</p>
        <p className="text-sm font-semibold">
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
        aria-label="Effort perçu de 1 à 10"
      />

      <p className="mt-4 mb-2 text-sm font-medium text-muted-foreground">Sensations</p>
      <div className="flex flex-wrap gap-2">
        {FEELING_TAGS.map((t) => (
          <Chip key={t} active={draft.tags.includes(t)} onClick={() => toggleTag(t)} className="h-9 px-3 text-xs">
            {t}
          </Chip>
        ))}
      </div>

      <textarea
        className="mt-4 h-20 w-full rounded-xl border border-border bg-background p-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        placeholder="Commentaire (douleur, météo, terrain…)"
        value={draft.comment}
        onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
      />

      <Button
        className="mt-3 w-full"
        disabled={draft.rating === 0}
        onClick={() => {
          setFeedback(sessionId, { ...draft, at: new Date().toISOString() })
          setEditing(false)
          toast.success('Ressenti enregistré ✓')
        }}
      >
        Enregistrer
      </Button>
    </Card>
  )
}

function Stars({ value, onChange, size = 'sm' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'lg' }) {
  return (
    <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined} aria-label={`Note ${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={cn(size === 'lg' ? 'size-9' : 'size-5', n <= value ? 'fill-accent text-accent' : 'text-muted-foreground/40')} />
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} sur 5`} onClick={() => onChange(n)} className="p-0.5 active:scale-90">
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        )
      })}
    </div>
  )
}
