import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, ExternalLinkIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, type BadgeTone } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Panel, PanelHeader } from '@/components/raice/panel'
import { toast } from '@/lib/toast'
import { api, type Billing, type BillingInterval, type PlanId } from '../api'
import { PLANS, PricingCards, PricingToggle, periodInterval, type Period, type PricingPlan } from '../pages/Pricing'

/**
 * Abonnement du coureur : offre en cours (renouvellement, portail Stripe) et cartes de tarifs.
 * Le paiement se fait sur Stripe Checkout ; au retour, le webhook peut avoir un temps de retard, d'où le rafraîchissement répété.
 */

export function useBilling() {
  return useQuery({ queryKey: ['billing'], queryFn: () => api<Billing>('/billing'), staleTime: 30_000 })
}

const PLAN_NAMES: Record<PlanId, string> = { free: 'Free', pro: 'Pro', expert: 'Expert' }
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  trialing: { label: 'Trial', tone: 'info' },
  past_due: { label: 'Payment due', tone: 'warning' },
  unpaid: { label: 'Unpaid', tone: 'danger' },
  incomplete: { label: 'Incomplete', tone: 'warning' },
  incomplete_expired: { label: 'Expired', tone: 'neutral' },
  canceled: { label: 'Canceled', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'neutral' },
}
const formatDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

export const planLabel = (b: Pick<Billing, 'plan' | 'interval'>) =>
  `${PLAN_NAMES[b.plan]}${b.plan !== 'free' && b.interval ? ` · ${b.interval === 'year' ? 'Yearly' : 'Monthly'}` : ''}`

export function BillingPage() {
  const qc = useQueryClient()
  const billing = useBilling()
  const [params, setParams] = useSearchParams()
  const wanted = params.get('plan') as PlanId | null
  const wantedInterval = params.get('interval') as BillingInterval | null
  const [period, setPeriod] = useState<Period>(wantedInterval === 'month' ? 'monthly' : 'yearly')
  const b = billing.data

  // Retour de Checkout : message, puis quelques relectures le temps que le webhook mette le compte à jour.
  const polled = useRef(false)
  useEffect(() => {
    if (params.get('checkout') !== 'success' || polled.current) return
    polled.current = true
    toast.success('Payment confirmed')
    let tries = 0
    const timer = window.setInterval(async () => {
      tries += 1
      const next = await qc.fetchQuery({ queryKey: ['billing'], queryFn: () => api<Billing>('/billing'), staleTime: 0 }).catch(() => null)
      if ((next && next.plan !== 'free') || tries >= 8) {
        window.clearInterval(timer)
        void qc.invalidateQueries({ queryKey: ['me'] })
        setParams((p) => {
          p.delete('checkout')
          return p
        }, { replace: true })
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [params, qc, setParams])

  const redirect = (r: { url: string }) => window.location.assign(r.url)
  const checkout = useMutation({
    mutationFn: (v: { plan: PlanId; interval: BillingInterval }) => api<{ url: string }>('/billing/checkout', { body: v }),
    onSuccess: redirect,
    onError: (err) => toast.error(err),
  })
  const portal = useMutation({
    mutationFn: () => api<{ url: string }>('/billing/portal', { method: 'POST' }),
    onSuccess: redirect,
    onError: (err) => toast.error(err),
  })

  const interval = periodInterval(period)
  const paid = !!b && b.plan !== 'free'

  const cta = (p: PricingPlan) => {
    if (!b) return <Button variant="secondary" disabled>…</Button>
    const current = p.id === b.plan && (p.id === 'free' || b.interval === interval)
    if (current) {
      return (
        <Button variant="secondary" disabled>
          Current plan
        </Button>
      )
    }
    // Abonné : tout changement (offre, période, retour à Free) passe par le portail Stripe.
    if (paid) {
      return (
        <Button variant="secondary" loading={portal.isPending} disabled={!b.configured} onClick={() => portal.mutate()}>
          {p.id === 'free' ? 'Downgrade' : p.id === b.plan ? `Switch to ${period}` : `Switch to ${p.name}`}
        </Button>
      )
    }
    if (p.id === 'free') return <Button variant="secondary" disabled>Free</Button>
    const pending = checkout.isPending && checkout.variables?.plan === p.id
    return (
      <Button
        variant={p.featured || p.id === wanted ? 'primary' : 'secondary'}
        loading={pending}
        disabled={!b.configured || (checkout.isPending && !pending)}
        onClick={() => checkout.mutate({ plan: p.id, interval })}
      >
        {p.id === wanted ? 'Continue to payment' : 'Upgrade'} <ArrowRightIcon className="size-4" />
      </Button>
    )
  }

  const rows: [string, string][] = b
    ? [
        ['Plan', planLabel(b)],
        ...(b.periodEnd && paid ? [[b.cancelAtPeriodEnd ? 'Ends on' : 'Renews on', formatDate(b.periodEnd)] as [string, string]] : []),
        ...(paid && b.interval ? [['Price', priceLabel(b.plan, b.interval)] as [string, string]] : []),
      ]
    : []

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="font-heading text-2xl">Billing</h1>

      <Panel>
        <PanelHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Current plan
              {b?.status && STATUS[b.status] && (
                <Badge size="sm" tone={STATUS[b.status].tone}>
                  {b.cancelAtPeriodEnd ? 'Canceling' : STATUS[b.status].label}
                </Badge>
              )}
              {b?.earlyAccess && (
                <Badge size="sm" tone="info">
                  Early access
                </Badge>
              )}
            </span>
          }
          actions={
            b?.hasCustomer && (
              <Button variant="secondary" size="sm" loading={portal.isPending} disabled={!b.configured} onClick={() => portal.mutate()}>
                Manage billing <ExternalLinkIcon className="size-4" />
              </Button>
            )
          }
        />
        <dl className="divide-y border-t">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-6 py-3 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Plans" actions={<PricingToggle value={period} onChange={setPeriod} />} />
        <PricingCards period={period} renderCta={cta} className="border-t" />
      </Panel>
    </div>
  )
}

function priceLabel(plan: PlanId, interval: BillingInterval) {
  const p = PLANS.find((x) => x.id === plan)
  if (!p) return '—'
  const v = interval === 'year' ? p.yearly : p.monthly
  return `€${v % 1 ? v.toFixed(2) : v} / ${interval}`
}
