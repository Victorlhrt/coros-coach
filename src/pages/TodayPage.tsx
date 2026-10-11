import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCorosAuth } from '@/lib/coros/auth-store'

export function TodayPage() {
  const connected = useCorosAuth((s) => s.connected)
  const [date] = useState(() => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))

  return (
    <>
      <PageHeader subtitle={date} title="Aujourd’hui" />
      <Card>
        <EmptyState icon={Sparkles} title="Pas encore de plan">
          {connected
            ? 'La génération du plan arrive dans le prochain incrément.'
            : 'Commence par connecter ta montre COROS dans Réglages.'}
        </EmptyState>
        {!connected && (
          <Link to="/reglages" className="block">
            <Button className="w-full">Connecter COROS</Button>
          </Link>
        )}
      </Card>
    </>
  )
}
