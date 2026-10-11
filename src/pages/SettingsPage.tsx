import { useMutation } from '@tanstack/react-query'
import { Bug, Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { AccountCard } from '@/components/AccountCard'
import { RecordsCard } from '@/components/RecordsCard'
import { SecurityCard } from '@/components/SecurityCard'
import { ZonesEditor } from '@/components/ZonesEditor'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useCorosAuth } from '@/lib/coros/auth-store'
import { disconnectCoros, startCorosLogin } from '@/lib/coros/client'
import { useVault } from '@/lib/lock/vault'
import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'

export function SettingsPage() {
  const connected = useCorosAuth((s) => s.connected)
  const settings = useSettings()
  const vaultEncrypted = useVault((s) => s.encrypted)

  const login = useMutation({ mutationFn: startCorosLogin })
  const logout = useMutation({ mutationFn: disconnectCoros })

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-3">
            <img src="/coros-logo.png" alt="" className="size-11 rounded-2xl" />
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

        <AccountCard />

        {vaultEncrypted && <SecurityCard />}

        <RecordsCard />

        <Card>
          <CardTitle>Zones d’allure</CardTitle>
          <div className="mt-4">
            <ZonesEditor />
          </div>
        </Card>

        <Card>
          <label className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Bilan automatique</CardTitle>
              <CardDescription className="mt-1">
                À la première ouverture de chaque semaine, Claude analyse la semaine écoulée (splits, ressenti, récupération) et
                propose les ajustements.
              </CardDescription>
            </div>
            <input
              type="checkbox"
              className="size-6 shrink-0 accent-[var(--accent)]"
              checked={settings.autoReview}
              onChange={(e) => settings.set({ autoReview: e.target.checked })}
            />
          </label>
        </Card>

        <PlanData />

        <Link to="/debug" className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Bug className="size-4" /> Debug MCP
        </Link>
      </div>
    </>
  )
}

function PlanData() {
  const store = usePlan()
  const fileInput = useRef<HTMLInputElement>(null)

  function exportJson() {
    const { goal, profile, zones, plan, coros, links, reviews, records, volume, feedback } = usePlan.getState()
    const data = { version: 2, goal, profile, zones, plan, coros, links, reviews, records, volume, feedback }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `plan-coros-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importJson(file: File) {
    try {
      store.importData(JSON.parse(await file.text()))
      toast.success('Plan importé ✓')
    } catch (err) {
      toast.error(err)
    }
  }

  return (
    <Card>
      <CardTitle>Plan</CardTitle>
      <CardDescription className="mt-1">{store.plan ? `${store.plan.name} · ${store.plan.weeks.length} semaines` : 'Aucun plan.'}</CardDescription>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" onClick={exportJson} disabled={!store.plan}>
          <Download className="size-4" /> Exporter
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" /> Importer
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importJson(file)
          e.target.value = ''
        }}
      />
      {store.plan && (
        <Button
          size="sm"
          variant="destructive"
          className="mt-2 w-full"
          onClick={() => {
            if (confirm('Supprimer le plan de l’app ? (le plan sur la montre n’est pas touché)')) store.reset()
          }}
        >
          Supprimer le plan
        </Button>
      )}
    </Card>
  )
}
