import { History } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'

export function HistoryPage() {
  return (
    <>
      <PageHeader title="Historique" />
      <Card>
        <EmptyState icon={History} title="Rien pour l’instant">
          Tes dernières activités COROS et l’écart prévu/réalisé apparaîtront ici.
        </EmptyState>
      </Card>
    </>
  )
}
