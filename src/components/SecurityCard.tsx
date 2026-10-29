import { useMutation, useQuery } from '@tanstack/react-query'
import { Lock, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { platformAuthAvailable } from '@/lib/lock/passkey'
import { addPasskey, changePin, disableLock, enableLock, lockNow, removePasskey, useVault } from '@/lib/lock/vault'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { Button } from './ui/button'
import { Card, CardTitle } from './ui/card'
import { Chip } from './ui/chip'
import { Input } from './ui/input'

const MIN_PIN = 6

/** Verrou de l'app : code de secours obligatoire, Face ID en plus si le navigateur le permet. */
export function SecurityCard() {
  const { encrypted, hasPasskey } = useVault()
  const settings = useSettings()
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [editingPin, setEditingPin] = useState(false)
  const faceIdAvailable = useQuery({ queryKey: ['platform-auth'], queryFn: platformAuthAvailable, staleTime: Infinity })

  const pinError = pin.length > 0 && pin.length < MIN_PIN ? `${MIN_PIN} characters minimum` : confirmPin && pin !== confirmPin ? 'The codes don’t match' : null
  const pinReady = pin.length >= MIN_PIN && pin === confirmPin

  const savePin = useMutation({
    mutationFn: () => (encrypted ? changePin(pin) : enableLock(pin)),
    onSuccess: () => {
      toast.success(encrypted ? 'Code changed ✓' : 'Lock enabled ✓')
      setPin('')
      setConfirmPin('')
      setEditingPin(false)
    },
    onError: toast.error,
  })
  const faceId = useMutation({
    mutationFn: addPasskey,
    onSuccess: () => toast.success('Face ID enabled ✓'),
    onError: toast.error,
  })

  const pinForm = (
    <div className="mt-4 space-y-2">
      <Input type="password" autoComplete="new-password" placeholder={`Code (${MIN_PIN} characters min.)`} value={pin} onChange={(e) => setPin(e.target.value)} />
      <Input type="password" autoComplete="new-password" placeholder="Confirm code" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
      {pinError && <p className="text-sm text-destructive">{pinError}</p>}
      <Button className="w-full" disabled={!pinReady || savePin.isPending} onClick={() => savePin.mutate()}>
        {savePin.isPending ? 'Encrypting…' : encrypted ? 'Change code' : 'Enable lock'}
      </Button>
    </div>
  )

  if (!encrypted) {
    return (
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-5 text-accent" /> Lock
        </CardTitle>
        {pinForm}
      </Card>
    )
  }

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <Lock className="size-5 text-session-easy" /> Lock on
      </CardTitle>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanFace className="size-5" />
          <span className="font-medium">Face ID</span>
        </div>
        {hasPasskey ? (
          <Button size="sm" variant="ghost" onClick={() => removePasskey()}>
            Remove
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={!faceIdAvailable.data || faceId.isPending} onClick={() => faceId.mutate()}>
            Enable
          </Button>
        )}
      </div>
      {faceIdAvailable.data === false && <p className="mt-1 text-xs text-muted-foreground">Face ID isn’t available in this browser.</p>}

      <p className="mt-5 mb-2 text-sm font-medium text-muted-foreground">Lock after</p>
      <div className="flex flex-wrap gap-2">
        {[1, 5, 15, 60].map((m) => (
          <Chip key={m} active={settings.autoLockMinutes === m} onClick={() => settings.set({ autoLockMinutes: m })}>
            {m === 60 ? '1 h' : `${m} min`}
          </Chip>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">in the background. The app also locks every time it launches.</p>

      {editingPin ? (
        pinForm
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditingPin(true)}>
            Change code
          </Button>
          <Button size="sm" variant="secondary" onClick={lockNow}>
            Lock now
          </Button>
        </div>
      )}
      <Button
        size="sm"
        variant="destructive"
        className="mt-2 w-full"
        onClick={async () => {
          if (confirm('Turn off the lock? Your API key and COROS connection will be stored unencrypted on this device.')) {
            await disableLock()
            toast.success('Lock turned off')
          }
        }}
      >
        Turn off lock
      </Button>
    </Card>
  )
}
