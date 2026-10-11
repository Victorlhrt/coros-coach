import { Check, CloudOff, RefreshCw, Smartphone } from 'lucide-react'
import type { SyncStatus } from '@/lib/coros/sync'

const META: Record<SyncStatus, { label: string; icon: typeof Check; className: string }> = {
  synced: { label: 'Sur la montre', icon: Check, className: 'text-session-easy' },
  modified: { label: 'Modifiée, à renvoyer', icon: RefreshCw, className: 'text-session-tempo' },
  'not-sent': { label: 'Pas encore envoyée', icon: CloudOff, className: 'text-muted-foreground' },
  'app-only': { label: 'Dans l’app uniquement', icon: Smartphone, className: 'text-muted-foreground' },
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
