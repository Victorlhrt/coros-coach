import { useConfirm } from '@/lib/coros/confirm-store'
import { Button } from './ui/button'

/** Feuille de confirmation en bas d'écran, utilisée avant toute écriture COROS. */
export function ConfirmSheet() {
  const pending = useConfirm((s) => s.pending)
  const answer = useConfirm((s) => s.answer)
  if (!pending) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => answer(false)}>
      <div
        role="dialog"
        aria-modal="true"
        className="animate-page-in mx-auto w-full max-w-md rounded-t-3xl bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">{pending.title}</h2>
        <p className="mt-2 text-muted-foreground">{pending.description}</p>
        {pending.details !== undefined && (
          <details className="mt-4 rounded-xl bg-muted p-3 text-xs">
            <summary className="cursor-pointer font-medium">Détail de la requête</summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(pending.details, null, 2)}
            </pre>
          </details>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => answer(false)}>
            Annuler
          </Button>
          <Button onClick={() => answer(true)}>{pending.confirmLabel ?? 'Confirmer'}</Button>
        </div>
      </div>
    </div>
  )
}
