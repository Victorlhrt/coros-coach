import { useMutation } from '@tanstack/react-query'
import { Lock, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { resetVault, unlockWithPasskey, unlockWithPin, useVault } from '@/lib/lock/vault'
import { Button } from './ui/button'
import { Input } from './ui/input'

/** Écran affiché tant que le coffre est verrouillé : Face ID, ou le code de secours. */
export function LockScreen() {
  const hasPasskey = useVault((s) => s.hasPasskey)
  const [pin, setPin] = useState('')

  const faceId = useMutation({ mutationFn: unlockWithPasskey })
  const code = useMutation({ mutationFn: () => unlockWithPin(pin), onError: () => setPin('') })
  const error = faceId.error ?? code.error

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-accent/15">
        <Lock className="size-8 text-accent" />
      </div>
      <h1 className="mt-5 text-3xl font-medium tracking-tight">Coach locked</h1>
      <p className="mt-2 text-muted-foreground">Your API key and COROS connection are encrypted on this device.</p>

      {hasPasskey && (
        <Button className="mt-8 w-full" onClick={() => faceId.mutate()} disabled={faceId.isPending}>
          <ScanFace className="size-5" /> Unlock with Face ID
        </Button>
      )}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (pin) code.mutate()
        }}
      >
        <label className="text-sm font-medium text-muted-foreground" htmlFor="pin">
          {hasPasskey ? 'Or use your code' : 'Code'}
        </label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="pin"
            type="password"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus={!hasPasskey}
          />
          <Button type="submit" variant="secondary" className="shrink-0" disabled={!pin || code.isPending}>
            {code.isPending ? '…' : 'OK'}
          </Button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-destructive">{error.message}</p>}

      <button
        className="mt-10 text-sm text-muted-foreground underline"
        onClick={() => {
          if (confirm('Erase the API key and COROS connection from this device? Your plan is kept.')) resetVault()
        }}
      >
        Forgot your code?
      </button>
    </div>
  )
}
