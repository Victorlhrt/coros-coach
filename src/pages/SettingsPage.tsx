import { Download, Upload } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { RecordsCard } from '@/components/RecordsCard'
import { SecurityCard } from '@/components/SecurityCard'
import { ZonesEditor } from '@/components/ZonesEditor'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useVault } from '@/lib/lock/vault'
import { usePlan } from '@/lib/store/plan'
import { useSettings } from '@/lib/store/settings'
import { toast } from '@/lib/toast'

/** `children` s'affiche sous le titre, avant les réglages du coach (intégrations de l'espace coureur). */
export function SettingsPage({ children }: { children?: ReactNode }) {
  const settings = useSettings()
  const vaultEncrypted = useVault((s) => s.encrypted)

  return (
    <>
      <PageHeader title="Settings" />
      {children && <div className="mb-4">{children}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Units</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(['metric', 'imperial'] as const).map((u) => (
              <Button key={u} size="sm" variant={settings.units === u ? 'default' : 'secondary'} onClick={() => settings.set({ units: u })}>
                {u === 'metric' ? 'km · min/km' : 'mi · min/mi'}
              </Button>
            ))}
          </div>
        </Card>

        {vaultEncrypted && <SecurityCard />}

        <RecordsCard />

        <Card>
          <CardTitle>Pace zones</CardTitle>
          <div className="mt-4">
            <ZonesEditor />
          </div>
        </Card>

        <Card>
          <label className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Weekly review</CardTitle>
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
      toast.success('Plan imported ✓')
    } catch (err) {
      toast.error(err)
    }
  }

  return (
    <Card>
      <CardTitle>Plan</CardTitle>
      <CardDescription className="mt-1">{store.plan ? `${store.plan.name} · ${store.plan.weeks.length} weeks` : 'No plan.'}</CardDescription>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" onClick={exportJson} disabled={!store.plan}>
          <Download className="size-4" /> Export
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" /> Import
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
            if (confirm('Delete the plan from the app? (the plan on your watch stays untouched)')) store.reset()
          }}
        >
          Delete plan
        </Button>
      )}
    </Card>
  )
}
