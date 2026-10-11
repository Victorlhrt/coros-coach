import { useToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()
  return (
    <div className="pointer-events-none fixed inset-x-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-md flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            'animate-page-in pointer-events-auto rounded-2xl px-4 py-3 text-left text-sm font-medium whitespace-pre-line shadow-lg',
            t.tone === 'error' ? 'bg-destructive text-white' : 'bg-foreground text-background',
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
