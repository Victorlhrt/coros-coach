import { useQuery } from '@tanstack/react-query'
import { LogOutIcon } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Logo } from '@/components/logo'
import { Button } from '@/components/shadcn/button'
import { api } from '../api'
import { DISTANCE_LABELS, PLAN_STATUS, formatDate } from '../format'
import { useLogout, useMe } from '../session'
import { siteHref } from '../brand'

type Plan = { id: string; title: string; goal_distance: string; goal_date: string | null; weeks: number | null; status: string }

/** Espace coureur minimal : ses demandes de plan et leur avancement. */
export function AccountPage() {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const plans = useQuery({ queryKey: ['account', 'plans'], queryFn: () => api<Plan[]>('/account/plans'), enabled: !!me.data })

  if (me.isPending) return <div className="min-h-dvh" />
  if (!me.data) return <Navigate to="/connexion?next=/compte" replace />

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-6">
      <header className="flex items-center justify-between">
        <a href={siteHref()}>
          <Logo />
        </a>
        <div className="flex items-center gap-2">
          {me.data.role === 'admin' && (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin">Back office</Link>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void logout().then(() => navigate('/'))}>
            <LogOutIcon /> Déconnexion
          </Button>
        </div>
      </header>
      <div>
        <h1 className="font-heading text-2xl">Bonjour {me.data.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground text-sm">Tes plans d’entraînement.</p>
      </div>
      {plans.data?.length === 0 && (
        <EmptyState
          title="Aucun plan pour l’instant"
          description="Réponds à quelques questions et on prépare ton plan."
          action={
            <Button asChild>
              <Link to="/onboarding">Créer mon plan</Link>
            </Button>
          }
        />
      )}
      <ul className="flex flex-col gap-3">
        {plans.data?.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
            <div>
              <p className="font-medium">{p.title}</p>
              <p className="text-muted-foreground text-sm">
                {DISTANCE_LABELS[p.goal_distance] ?? p.goal_distance}
                {p.goal_date && ` · course le ${formatDate(p.goal_date)}`}
                {p.weeks && ` · ${p.weeks} semaines`}
              </p>
            </div>
            <Badge tone={(PLAN_STATUS[p.status]?.tone ?? 'neutral') as BadgeTone}>{PLAN_STATUS[p.status]?.label ?? p.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
