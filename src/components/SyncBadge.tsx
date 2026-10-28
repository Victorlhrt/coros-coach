import { Check, CloudOff, RefreshCw, Smartphone } from 'lucide-react'
import type { SyncStatus } from '@/lib/coros/sync'

const META: Record<SyncStatus, { label: string; icon: typeof Check; className: string }> = {
  synced: { label: 'On your watch', icon: Check, className: 'text-session-easy' },
  modified: { label: 'Changed, resend needed', icon: RefreshCw, className: 'text-session-tempo' },
  'not-sent': { label: 'Not sent yet', icon: CloudOff, className: 'text-muted-foreground' },
  'app-only': { label: 'In the app only', icon: Smartphone, className: 'text-muted-foreground' },
}

export function SyncBadge({ status, compact = false }: { status: SyncStatus; compact?: boolean }) {
  const { label, icon: Icon, className } = META[status]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${className}`} title={label}>
      <Icon className="size-3.5" />
      {!compact && label}
    </span>
  )
}
