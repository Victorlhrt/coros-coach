import { useQuery } from '@tanstack/react-query'
import { BugIcon, ExternalLinkIcon, MessageCircleIcon, MonitorIcon, RotateCcwIcon, SmartphoneIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Button } from '@/components/shadcn/button'
import { cn } from '@/lib/utils'
import { api } from '../api'
import { VARIANT_STATUS } from '../format'
import { ErrorNote, PageTitle, Panel } from './ui'

type VariantRow = { id: string; name: string; description: string; status: 'draft' | 'live' | 'archived'; steps: number }

const logo = (src: string, invert = false) => <img src={src} alt="" className={`size-5 rounded-[5px] object-contain ${invert ? 'invert' : ''}`} />
/** Branches du parcours Complet ouvertes directement (`flow=`) : les premières réponses sont données d'avance. */
const WORKFLOWS = [
  { value: 'default', label: 'Default', icon: <MessageCircleIcon className="size-5 text-muted-foreground" /> },
  { value: 'coros', label: 'COROS', icon: logo('/partners/coros.png') },
  { value: 'garmin', label: 'Garmin', icon: logo('/partners/garmin.png', true) },
  { value: 'strava', label: 'Strava (no watch)', icon: logo('/partners/strava.png') },
]

/**
 * Banc d'essai des onboardings : choisir un parcours et le dérouler ici même, en format téléphone ou ordinateur.
 * Toujours en aperçu (`preview=1`) : rien n'est compté dans les statistiques ni rattaché à un compte.
 */
export function TestingPage() {
  const variants = useQuery({ queryKey: ['admin', 'onboardings'], queryFn: () => api<VariantRow[]>('/admin/onboardings') })
  const usable = (variants.data ?? []).filter((v) => v.status !== 'archived')
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone')
  const [run, setRun] = useState(0)
  const [workflow, setWorkflow] = useState('default')
  const current = usable.find((v) => v.id === selected) ?? usable.find((v) => v.id === 'complet') ?? usable[0]
  // Les branches de test n'existent que dans le parcours Complet (conversation avec Pacer).
  const flow = current?.id === 'complet' && workflow !== 'default' ? workflow : null
  const url = current ? `/onboarding?variant=${encodeURIComponent(current.id)}&preview=1${flow ? `&flow=${flow}` : ''}` : null

  return (
    <>
      <PageTitle
        title="Testing"
        description="Run an onboarding flow in preview mode, without skewing the stats."
        actions={
          url && (
            <>
              <Button size="sm" variant="outline" onClick={() => setRun((r) => r + 1)}>
                <RotateCcwIcon /> Restart
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon /> New tab
                </a>
              </Button>
            </>
          )
        }
      />
      <ErrorNote error={variants.error} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Panel title="Flows">
          {current && (
            <RadioCards
              aria-label="Flow to test"
              layout="list"
              value={current.id}
              onValueChange={(id) => {
                setSelected(id)
                setRun((r) => r + 1)
              }}
              options={usable.map((v) => ({
                value: v.id,
                label: v.name,
                description: `${v.steps} step${v.steps > 1 ? 's' : ''}`,
                meta: <Badge size="sm" tone={VARIANT_STATUS[v.status].tone}>{VARIANT_STATUS[v.status].label}</Badge>,
              }))}
            />
          )}
          {current?.id === 'complet' && (
            <div className="mt-4 border-t pt-4">
              <p className="mb-3 font-medium text-sm">Workflow</p>
              <RadioCards
                aria-label="Workflow to test"
                layout="list"
                value={workflow}
                onValueChange={(w) => {
                  setWorkflow(w)
                  setRun((r) => r + 1)
                }}
                options={WORKFLOWS}
              />
            </div>
          )}
          <div className="mt-4 border-t pt-4">
            <p className="font-medium text-sm">COROS MCP</p>
            <p className="mt-1 text-muted-foreground text-xs">Call the COROS MCP tools by hand with your own connected account and inspect the raw responses.</p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <a href="/account/debug" target="_blank" rel="noreferrer">
                <BugIcon /> Open MCP debug
              </a>
            </Button>
          </div>
        </Panel>
        <Panel
          title={current ? current.name : 'Preview'}
          description={current?.description}
          actions={
            <SegmentedControl
              label="Format"
              options={[
                { value: 'phone', label: 'Phone', accessory: <SmartphoneIcon className="size-3.5" /> },
                { value: 'desktop', label: 'Desktop', accessory: <MonitorIcon className="size-3.5" /> },
              ]}
              value={device}
              onValueChange={(v) => setDevice(v as 'phone' | 'desktop')}
            />
          }
        >
          {url && (
            <div className="flex justify-center rounded-xl border bg-black/40 p-4">
              <iframe
                key={`${current?.id}-${flow}-${run}`}
                title={`Preview of flow ${current?.name}`}
                src={url}
                className={cn(
                  'bg-background transition-all',
                  device === 'phone' ? 'h-[780px] w-[390px] rounded-[40px] border-[6px] border-[#1f1f1f]' : 'h-[780px] w-full rounded-lg border'
                )}
              />
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
