import { useMutation } from '@tanstack/react-query'
import { KeyRound, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { login, registerPasskey, useAuth } from '@/lib/server/auth'
import { LogoIcon } from './logo'
import { Button } from './ui/button'
import { Input } from './ui/input'

function message(err: unknown) {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'Opération annulée.'
  return err instanceof Error ? err.message : String(err)
}

/** Connexion par passkey. Premier appareil (ou appareil sans passkey synchronisé) : code d'installation. */
export function LoginScreen() {
  const hasCredentials = useAuth((s) => s.hasCredentials)
  const [setup, setSetup] = useState(!hasCredentials)
  const [code, setCode] = useState('')

  const signIn = useMutation({ mutationFn: login })
  const register = useMutation({ mutationFn: () => registerPasskey(code.trim()) })
  const error = signIn.error ?? register.error

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex size-16 items-center justify-center rounded-3xl border bg-black">
        <LogoIcon glass className="size-10" />
      </div>
      <h1 className="mt-5 text-3xl font-medium tracking-tight">
        <span className="italic">Raice.run</span> <span className="text-muted-foreground">· Coach</span>
      </h1>

      {!setup ? (
        <>
          <p className="mt-2 text-muted-foreground">Connecte-toi avec Face ID.</p>
          <Button className="mt-8 w-full" onClick={() => signIn.mutate()} disabled={signIn.isPending}>
            <ScanFace className="size-5" /> Se connecter
          </Button>
          <button className="mt-6 text-sm text-muted-foreground underline" onClick={() => setSetup(true)}>
            Nouvel appareil sans passkey ?
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) register.mutate()
          }}
        >
          <p className="mt-2 text-muted-foreground">
            {hasCredentials
              ? 'Ajoute un passkey pour cet appareil avec le code d’installation.'
              : 'Première connexion : saisis le code d’installation (variable SETUP_CODE du serveur), puis crée ton passkey Face ID.'}
          </p>
          <label className="mt-6 block text-sm font-medium text-muted-foreground" htmlFor="setup">
            Code d’installation
          </label>
          <Input id="setup" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} className="mt-1.5" />
          <Button type="submit" className="mt-4 w-full" disabled={!code.trim() || register.isPending}>
            <KeyRound className="size-5" /> Créer mon passkey
          </Button>
          {hasCredentials && (
            <button type="button" className="mt-6 text-sm text-muted-foreground underline" onClick={() => setSetup(false)}>
              J’ai déjà un passkey
            </button>
          )}
        </form>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{message(error)}</p>}
    </div>
  )
}
