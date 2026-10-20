import type { SessionType } from '@/lib/coach/schema'
import { TYPE_META } from '@/lib/coach/ui'

export function TypeBadge({ type }: { type: SessionType | 'rest' }) {
  const meta = TYPE_META[type]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `color-mix(in oklch, ${meta.color} 18%, transparent)`, color: meta.color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  )
}
