import { ArrowRightIcon, CheckIcon, FlaskConicalIcon, MinusIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/arc/badge/badge'
import { BillingToggle } from '@/components/arc/billing-toggle/billing-toggle'
import { Button } from '@/components/shadcn/button'
import { cn } from '@/lib/utils'
import { appHref } from '../brand'

/**
 * Tarifs : Free, Pro et Expert, au mois ou à l'année (mêmes montants que les prix Stripe).
 * `PricingCards` sert à la landing (Free → onboarding, Pro et Expert → page Billing de l'app)
 * et à la page Billing, qui remplace les boutons par les siens (`renderCta`).
 */

export type Period = 'monthly' | 'yearly'
export type PricingPlanId = 'free' | 'pro' | 'expert'
type Feature = { label: string; value: boolean | string }
export type PricingPlan = { id: PricingPlanId; name: string; monthly: number; yearly: number; cta: string; featured?: boolean; features: Feature[] }

export const periodInterval = (p: Period) => (p === 'yearly' ? 'year' : 'month')

export const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    cta: 'Start free',
    features: [
      { label: 'Active plan', value: '1' },
      { label: 'Data source', value: '1 watch or Strava' },
      { label: 'Leaderboard', value: true },
      { label: 'Analytics', value: 'Basic' },
      { label: 'Weekly review', value: false },
      { label: 'Pacer coach chat', value: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 12.99,
    yearly: 99,
    cta: 'Go Pro',
    featured: true,
    features: [
      { label: 'Plans', value: 'Unlimited' },
      { label: 'Data sources', value: 'All' },
      { label: 'Leaderboard', value: true },
      { label: 'Fitness analytics & GPX race strategy', value: true },
      { label: 'Weekly review that adapts your plan', value: true },
      { label: 'Pacer coach chat', value: 'Limited' },
    ],
  },
  {
    id: 'expert',
    name: 'Expert',
    monthly: 24.99,
    yearly: 199,
    cta: 'Go Expert',
    features: [
      { label: 'Everything in Pro', value: true },
      { label: 'Pacer coach chat', value: 'Unlimited' },
      { label: 'Expert mode: test new studies on your plan', value: 'Soon' },
    ],
  },
]

const euro = (v: number) => `€${v % 1 ? v.toFixed(2) : v}`

export function PricingToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <BillingToggle
      value={value}
      onValueChange={(v) => onChange(v as Period)}
      options={[
        { value: 'monthly', label: 'Monthly' },
        { value: 'yearly', label: 'Yearly', badge: '−35%' },
      ]}
    />
  )
}

/** Bouton par défaut (landing) : Free → onboarding, Pro et Expert → page Billing de l'app (connexion demandée au besoin). */
function LandingCta({ plan, period }: { plan: PricingPlan; period: Period }) {
  const href = plan.id === 'free' ? appHref('/onboarding') : appHref(`/account/billing?plan=${plan.id}&interval=${periodInterval(period)}`)
  return (
    <Button asChild variant={plan.featured ? 'default' : 'outline'}>
      <a href={href}>
        {plan.cta} <ArrowRightIcon data-icon="inline-end" />
      </a>
    </Button>
  )
}

export function PricingCards({ period, renderCta, className }: { period: Period; renderCta?: (plan: PricingPlan) => ReactNode; className?: string }) {
  return (
    <div className={cn('grid w-full gap-px bg-border md:grid-cols-3', className)}>
      {PLANS.map((p) => {
        const perMonth = period === 'yearly' ? p.yearly / 12 : p.monthly
        return (
          <div key={p.id} className={cn('relative flex flex-col gap-6 bg-background p-6 md:p-8', p.featured && 'bg-[radial-gradient(80%_60%_at_50%_0%,--theme(--color-foreground/.06),transparent)]')}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium text-lg">{p.name}</h3>
              {p.featured && <Badge size="sm">Most popular</Badge>}
              {p.id === 'expert' && (
                <Badge size="sm" icon={<FlaskConicalIcon className="size-3" />}>
                  Backed by science
                </Badge>
              )}
            </div>
            <div>
              <p className="flex items-baseline gap-1">
                <span className="font-semibold text-4xl tabular-nums tracking-tight">{euro(Math.round(perMonth * 100) / 100)}</span>
                <span className="text-muted-foreground text-sm">/ month</span>
              </p>
              <p className="mt-1 h-4 text-muted-foreground text-xs tabular-nums">{p.monthly > 0 && period === 'yearly' ? `${euro(p.yearly)} billed yearly` : ''}</p>
            </div>
            <ul className="flex flex-1 flex-col gap-3 text-sm">
              {p.features.map((f) => (
                <li key={f.label} className={cn('flex items-start gap-2.5', f.value === false && 'text-muted-foreground/60')}>
                  {f.value === false ? <MinusIcon className="mt-0.5 size-4 shrink-0" /> : <CheckIcon className="mt-0.5 size-4 shrink-0" />}
                  <span className="min-w-0 flex-1">{f.label}</span>
                  {typeof f.value === 'string' && <span className="shrink-0 text-right text-muted-foreground">{f.value}</span>}
                </li>
              ))}
            </ul>
            {renderCta ? renderCta(p) : <LandingCta plan={p} period={period} />}
          </div>
        )
      })}
    </div>
  )
}

export function Pricing() {
  const [period, setPeriod] = useState<Period>('yearly')
  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <div className="flex flex-col items-center gap-3">
        <PricingToggle value={period} onChange={setPeriod} />
        <Badge tone="info" size="sm">
          Free during early access
        </Badge>
      </div>
      <PricingCards period={period} />
    </div>
  )
}
