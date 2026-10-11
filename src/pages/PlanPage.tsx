import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'

export function PlanPage() {
  return (
    <>
      <PageHeader title="Plan" />
      <Card>
        <EmptyState icon={CalendarDays} title="Aucun plan">
          Ton plan semaine par semaine s’affichera ici.
        </EmptyState>
      </Card>
    </>
  )
}
