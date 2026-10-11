import { useMutation } from '@tanstack/react-query'
import { Bug, Eye, EyeOff, ShieldAlert, Watch } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { disconnectCoros, startCorosLogin } from '@/lib/coros/client'
import { MODELS, useSettings } from '@/lib/store/settings'

export function SettingsPage() {
  const connected = useCorosAuth((s) => s.connected)
  const settings = useSettings()
  const [showKey, setShowKey] = useState(false)

  const login = useMutation({ mutationFn: startCorosLogin })
  const logout = useMutation({ mutationFn: disconnectCoros })

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-muted">
              <Watch className="size-6" />
            </div>
            <div className="flex-1">
              <CardTitle>COROS</CardTitle>
              <CardDescription>{connected ? 'Connecté' : 'Non connecté'}</CardDescription>
            </div>
            <span className={connected ? 'size-2.5 rounded-full bg-session-easy' : 'size-2.5 rounded-full bg-session-rest'} />
          </div>
          {connected ? (
            <Button variant="destructive" className="mt-5 w-full" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Déconnecter COROS
            </Button>
          ) : (
            <Button className="mt-5 w-full" onClick={() => login.mutate()} disabled={login.isPending}>
              {login.isPending ? 'Redirection…' : 'Connecter COROS'}
            </Button>
          )}
          {login.error && <p className="mt-3 text-sm text-destructive">{login.error.message}</p>}
        </Card>

        <Card>
          <CardTitle>Clé API Anthropic</CardTitle>
          <CardDescription className="mt-1">Utilisée pour générer et ajuster ton plan avec Claude.</CardDescription>
          <div className="relative mt-4">
            <Input
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={settings.anthropicKey}
              onChange={(e) => settings.set({ anthropicKey: e.target.value.trim() })}
              className="pr-12"
            />
            <button
              type="button"
              aria-label={showKey ? 'Masquer la clé' : 'Afficher la clé'}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          <div className="mt-4 flex gap-3 rounded-xl bg-session-tempo/12 p-3 text-sm">
            <ShieldAlert className="size-5 shrink-0 text-session-tempo" />
            <p>
              La clé reste <strong>dans ce navigateur</strong> (localStorage) et part directement chez Anthropic.
              Toute personne ayant accès à ce téléphone, ou un script injecté dans la page, pourrait la lire.
              Utilise une clé dédiée avec une limite de dépense.
            </p>
          </div>
          <p className="mt-4 text-sm font-medium">Modèle</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => settings.set({ model: m.id })}
                className={
                  settings.model === m.id
                    ? 'rounded-xl bg-accent p-3 text-left text-accent-foreground'
                    : 'rounded-xl bg-muted p-3 text-left'
                }
              >
                <div className="font-semibold">{m.label}</div>
                <div className="text-xs opacity-75">{m.price} / M tokens</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Affichage</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(['dark', 'light'] as const).map((t) => (
              <Button key={t} size="sm" variant={settings.theme === t ? 'default' : 'secondary'} onClick={() => settings.set({ theme: t })}>
                {t === 'dark' ? 'Sombre' : 'Clair'}
              </Button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['metric', 'imperial'] as const).map((u) => (
              <Button key={u} size="sm" variant={settings.units === u ? 'default' : 'secondary'} onClick={() => settings.set({ units: u })}>
                {u === 'metric' ? 'km · min/km' : 'mi · min/mi'}
              </Button>
            ))}
          </div>
        </Card>

        <Link to="/debug" className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Bug className="size-4" /> Debug MCP
        </Link>
      </div>
    </>
  )
}
