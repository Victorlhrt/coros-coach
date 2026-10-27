import { useQuery } from '@tanstack/react-query'
import { ExternalLinkIcon, MonitorIcon, RotateCcwIcon, SmartphoneIcon } from 'lucide-react'
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
  const current = usable.find((v) => v.id === selected) ?? usable.find((v) => v.id === 'complet') ?? usable[0]
  const url = current ? `/onboarding?variant=${encodeURIComponent(current.id)}&preview=1` : null

  return (
    <>
      <PageTitle
        title="Testing"
        description="Lance un parcours d’onboarding en aperçu, sans fausser les statistiques."
        actions={
          url && (
            <>
              <Button size="sm" variant="outline" onClick={() => setRun((r) => r + 1)}>
                <RotateCcwIcon /> Relancer
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon /> Nouvel onglet
                </a>
              </Button>
            </>
          )
        }
      />
      <ErrorNote error={variants.error} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Panel title="Parcours">
          {current && (
            <RadioCards
              aria-label="Parcours à tester"
              layout="list"
              value={current.id}
              onValueChange={(id) => {
                setSelected(id)
                setRun((r) => r + 1)
              }}
              options={usable.map((v) => ({
                value: v.id,
                label: v.name,
                description: `${v.steps} étape${v.steps > 1 ? 's' : ''}`,
                meta: <Badge size="sm" tone={VARIANT_STATUS[v.status].tone}>{VARIANT_STATUS[v.status].label}</Badge>,
              }))}
            />
          )}
        </Panel>
        <Panel
          title={current ? current.name : 'Aperçu'}
          description={current?.description}
          actions={
            <SegmentedControl
              label="Format"
              options={[
                { value: 'phone', label: 'Téléphone', accessory: <SmartphoneIcon className="size-3.5" /> },
                { value: 'desktop', label: 'Ordinateur', accessory: <MonitorIcon className="size-3.5" /> },
              ]}
              value={device}
              onValueChange={(v) => setDevice(v as 'phone' | 'desktop')}
            />
          }
        >
          {url && (
            <div className="flex justify-center rounded-xl border bg-black/40 p-4">
              <iframe
                key={`${current?.id}-${run}`}
                title={`Aperçu du parcours ${current?.name}`}
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
