import { useMutation, useQuery } from '@tanstack/react-query'
import { Lock, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { platformAuthAvailable } from '@/lib/lock/passkey'
import { addPasskey, changePin, disableLock, enableLock, lockNow, removePasskey, useVault } from '@/lib/lock/vault'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'
import { Button } from './ui/button'
import { Card, CardDescription, CardTitle } from './ui/card'
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

  const pinError = pin.length > 0 && pin.length < MIN_PIN ? `${MIN_PIN} caractères minimum` : confirmPin && pin !== confirmPin ? 'Les codes ne correspondent pas' : null
  const pinReady = pin.length >= MIN_PIN && pin === confirmPin

  const savePin = useMutation({
    mutationFn: () => (encrypted ? changePin(pin) : enableLock(pin)),
    onSuccess: () => {
      toast.success(encrypted ? 'Code modifié ✓' : 'Verrou activé ✓')
      setPin('')
      setConfirmPin('')
      setEditingPin(false)
    },
    onError: toast.error,
  })
  const faceId = useMutation({
    mutationFn: addPasskey,
    onSuccess: () => toast.success('Face ID activé ✓'),
    onError: toast.error,
  })

  const pinForm = (
    <div className="mt-4 space-y-2">
      <Input type="password" autoComplete="new-password" placeholder={`Code (${MIN_PIN} caractères min.)`} value={pin} onChange={(e) => setPin(e.target.value)} />
      <Input type="password" autoComplete="new-password" placeholder="Confirmer le code" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
      {pinError && <p className="text-sm text-destructive">{pinError}</p>}
      <Button className="w-full" disabled={!pinReady || savePin.isPending} onClick={() => savePin.mutate()}>
        {savePin.isPending ? 'Chiffrement…' : encrypted ? 'Changer le code' : 'Activer le verrou'}
      </Button>
    </div>
  )

  if (!encrypted) {
    return (
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-5 text-accent" /> Verrou
        </CardTitle>
        <CardDescription className="mt-1">
          Chiffre la clé API et la connexion COROS sur cet appareil. Un code de secours est nécessaire, Face ID s’ajoute ensuite.
          Un code oublié efface ces secrets (le plan est conservé).
        </CardDescription>
        {pinForm}
      </Card>
    )
  }

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <Lock className="size-5 text-session-easy" /> Verrou actif
      </CardTitle>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanFace className="size-5" />
          <span className="font-medium">Face ID</span>
        </div>
        {hasPasskey ? (
          <Button size="sm" variant="ghost" onClick={() => removePasskey()}>
            Retirer
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={!faceIdAvailable.data || faceId.isPending} onClick={() => faceId.mutate()}>
            Activer
          </Button>
        )}
      </div>
      {faceIdAvailable.data === false && <p className="mt-1 text-xs text-muted-foreground">Face ID indisponible dans ce navigateur.</p>}

      <p className="mt-5 mb-2 text-sm font-medium text-muted-foreground">Verrouiller après</p>
      <div className="flex flex-wrap gap-2">
        {[1, 5, 15, 60].map((m) => (
          <Chip key={m} active={settings.autoLockMinutes === m} onClick={() => settings.set({ autoLockMinutes: m })}>
            {m === 60 ? '1 h' : `${m} min`}
          </Chip>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">en arrière-plan. L’app se verrouille aussi à chaque lancement.</p>

      {editingPin ? (
        pinForm
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditingPin(true)}>
            Changer le code
          </Button>
          <Button size="sm" variant="secondary" onClick={lockNow}>
            Verrouiller
          </Button>
        </div>
      )}
      <Button
        size="sm"
        variant="destructive"
        className="mt-2 w-full"
        onClick={async () => {
          if (confirm('Désactiver le verrou ? La clé API et la connexion COROS seront stockées en clair sur cet appareil.')) {
            await disableLock()
            toast.success('Verrou désactivé')
          }
        }}
      >
        Désactiver le verrou
      </Button>
    </Card>
  )
}
