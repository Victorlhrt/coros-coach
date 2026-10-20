import { useRef } from 'react'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { useConfirm } from '@/lib/coros/confirm-store'
import { Button } from './ui/button'

/** Feuille de confirmation en bas d'écran (Arc), utilisée avant toute écriture COROS. */
export function ConfirmSheet() {
  const pending = useConfirm((s) => s.pending)
  const answer = useConfirm((s) => s.answer)
  // Garde le contenu affiché pendant l'animation de fermeture.
  const last = useRef(pending)
  if (pending) last.current = pending
  const shown = pending ?? last.current

  return (
    <BottomSheet
      open={!!pending}
      onOpenChange={(open) => !open && pending && answer(false)}
      title={shown?.title ?? ''}
      description={shown?.description}
      detents={[0.5, 0.92]}
      closeLabel="Fermer"
    >
      {shown?.details !== undefined && (
        <details className="rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-3 text-xs">
          <summary className="cursor-pointer font-medium">Détail de la requête</summary>
          <pre className="mt-2 max-h-60 overflow-auto break-all whitespace-pre-wrap">{JSON.stringify(shown.details, null, 2)}</pre>
        </details>
      )}
      <div className="mt-6 grid grid-cols-2 gap-3 pb-[env(safe-area-inset-bottom)]">
        <Button variant="secondary" onClick={() => answer(false)}>
          Annuler
        </Button>
        <Button onClick={() => answer(true)}>{shown?.confirmLabel ?? 'Confirmer'}</Button>
      </div>
    </BottomSheet>
  )
}
