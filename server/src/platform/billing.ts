import { Hono } from 'hono'
import Stripe from 'stripe'
import { z } from 'zod'
import { config } from '../config.js'
import { requireUser, type SessionUser } from './auth.js'
import { audit, db } from './db.js'
import { type PlanId, userEntitlements } from './entitlements.js'

/**
 * Abonnements Stripe : Checkout pour souscrire, portail client pour tout le reste (changement d'offre, résiliation,
 * moyen de paiement). Le webhook recopie l'état de l'abonnement sur le compte ; Stripe reste la source de vérité.
 * Les prix sont retrouvés par lookup_key (pro_monthly, pro_yearly, expert_monthly, expert_yearly).
 */

type Env = { Variables: { user: SessionUser } }
type Paid = Exclude<PlanId, 'free'>
type Interval = 'month' | 'year'

// Version d'API figée sur celle du SDK installé, pour que les objets reçus gardent la forme attendue.
const apiUrl = config.stripeApiUrl ? new URL(config.stripeApiUrl) : null
export const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey, {
      apiVersion: Stripe.API_VERSION,
      appInfo: { name: 'Raice.run' },
      ...(apiUrl ? { host: apiUrl.hostname, port: Number(apiUrl.port) || undefined, protocol: apiUrl.protocol === 'http:' ? ('http' as const) : ('https' as const) } : {}),
    })
  : null

const NOT_SET_UP = { error: 'Billing isn’t set up' } as const

// Franchise en base de TVA (micro-entrepreneur) : pas de TVA facturée, mention légale sur le paiement et les factures.
const VAT_MENTION = 'TVA non applicable, art. 293 B du CGI'

const LOOKUP_KEYS = ['pro_monthly', 'pro_yearly', 'expert_monthly', 'expert_yearly'] as const
const lookupKey = (plan: Paid, interval: Interval) => `${plan}_${interval === 'year' ? 'yearly' : 'monthly'}`

/** Offre déduite d'une lookup_key (`pro_yearly` → pro). */
function planFromLookupKey(key: string | null | undefined): Paid | null {
  const plan = key?.split('_')[0]
  return plan === 'pro' || plan === 'expert' ? plan : null
}

// Prix retrouvés par lookup_key, gardés 10 minutes en mémoire.
let priceCache: { at: number; byKey: Map<string, string> } | null = null
async function priceId(key: string) {
  if (!stripe) throw new Error('Stripe not configured')
  if (!priceCache || Date.now() - priceCache.at > 10 * 60_000) {
    const prices = await stripe.prices.list({ lookup_keys: [...LOOKUP_KEYS], active: true, limit: 10 })
    priceCache = { at: Date.now(), byKey: new Map(prices.data.filter((p) => p.lookup_key).map((p) => [p.lookup_key!, p.id])) }
  }
  return priceCache.byKey.get(key) ?? null
}

/** Statuts qui donnent accès à l'offre payée (past_due : période de grâce pendant les relances de paiement). */
const LIVE_STATUSES = new Set<string>(['active', 'trialing', 'past_due'])

type BillingRow = {
  plan: PlanId
  plan_status: string | null
  plan_interval: string | null
  plan_period_end: Date | null
  plan_cancel_at_period_end: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  email: string
  name: string
}

const readBilling = async (userId: string) =>
  (
    await db<BillingRow[]>`
      select plan, plan_status, plan_interval, plan_period_end, plan_cancel_at_period_end, stripe_customer_id, stripe_subscription_id, email, name
      from users where id = ${userId}`
  )[0]

/** Client Stripe du compte, créé au premier paiement (recréé s'il n'existe plus chez Stripe, ex. passage sandbox → live). */
async function ensureCustomer(user: SessionUser, row: BillingRow) {
  if (row.stripe_customer_id) {
    try {
      const existing = await stripe!.customers.retrieve(row.stripe_customer_id)
      if (!existing.deleted) {
        if (existing.invoice_settings?.footer !== VAT_MENTION) {
          await stripe!.customers.update(existing.id, { invoice_settings: { footer: VAT_MENTION } })
        }
        return existing.id
      }
    } catch (err) {
      if ((err as { code?: string }).code !== 'resource_missing') throw err
    }
    await db`update users set stripe_customer_id = null, stripe_subscription_id = null where id = ${user.id} and stripe_customer_id = ${row.stripe_customer_id}`
  }
  const customer = await stripe!.customers.create({
    email: row.email,
    name: row.name,
    metadata: { userId: user.id },
    invoice_settings: { footer: VAT_MENTION },
  })
  const [saved] = await db<{ stripe_customer_id: string }[]>`
    update users set stripe_customer_id = coalesce(stripe_customer_id, ${customer.id}) where id = ${user.id} returning stripe_customer_id`
  // Deux paiements lancés en même temps : on garde le premier client enregistré et on supprime le doublon.
  if (saved && saved.stripe_customer_id !== customer.id) {
    await stripe!.customers.del(customer.id).catch(() => undefined)
    return saved.stripe_customer_id
  }
  return customer.id
}

/** Abonnement encore vivant chez Stripe pour ce client (au cas où le webhook n'est pas encore passé). */
async function liveSubscription(customerId: string) {
  const subs = await stripe!.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
  return subs.data.find((s) => LIVE_STATUSES.has(s.status) || s.status === 'incomplete') ?? null
}

// Configuration du portail créée par scripts/stripe-setup.sh (metadata.app = raice), sinon celle par défaut du compte.
let portalConfig: { at: number; id: string | undefined } | null = null
async function portalConfiguration() {
  if (!portalConfig || Date.now() - portalConfig.at > 10 * 60_000) {
    const list = await stripe!.billingPortal.configurations.list({ active: true, limit: 20 })
    portalConfig = { at: Date.now(), id: list.data.find((p) => p.metadata?.app === 'raice')?.id }
  }
  return portalConfig.id
}

async function portalUrl(customerId: string) {
  const configuration = await portalConfiguration()
  const session = await stripe!.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.origin}/account/billing`,
    ...(configuration ? { configuration } : {}),
  })
  return session.url
}

export const billingRoutes = new Hono<Env>()
billingRoutes.use('*', requireUser)

billingRoutes.get('/', async (c) => {
  const user = c.get('user')
  const [row, ent] = await Promise.all([readBilling(user.id), userEntitlements(user.id, user.role)])
  return c.json({
    configured: !!stripe,
    plan: row?.plan ?? 'free',
    status: row?.plan_status ?? null,
    interval: row?.plan_interval ?? null,
    periodEnd: row?.plan_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: row?.plan_cancel_at_period_end ?? false,
    hasCustomer: !!row?.stripe_customer_id,
    enforced: ent.enforced,
    earlyAccess: ent.earlyAccess,
    entitlements: ent.entitlements,
  })
})

const CheckoutBody = z.object({ plan: z.enum(['pro', 'expert']), interval: z.enum(['month', 'year']) })

billingRoutes.post('/checkout', async (c) => {
  if (!stripe) return c.json(NOT_SET_UP, 503)
  const user = c.get('user')
  const parsed = CheckoutBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Pick a plan and a billing period.' }, 400)
  const { plan, interval } = parsed.data
  const row = await readBilling(user.id)
  if (!row) return c.json({ error: 'Account not found' }, 404)

  try {
    const price = await priceId(lookupKey(plan, interval))
    if (!price) return c.json({ error: 'This plan isn’t available yet.' }, 503)
    const customer = await ensureCustomer(user, row)

    // Déjà abonné : on n'ouvre pas un second abonnement, le changement d'offre passe par le portail.
    if (await liveSubscription(customer)) return c.json({ url: await portalUrl(customer), portal: true })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user.id },
        ...(config.stripeTrialDays > 0 ? { trial_period_days: config.stripeTrialDays } : {}),
      },
      custom_text: { submit: { message: VAT_MENTION } },
      metadata: { userId: user.id, plan, interval },
      success_url: `${config.origin}/account/billing?checkout=success`,
      cancel_url: `${config.origin}/account/billing`,
    })
    await audit(user.id, 'billing.checkout', row.email, { plan, interval })
    return c.json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout', err)
    return c.json({ error: 'Couldn’t start the payment. Try again in a moment.' }, 502)
  }
})

billingRoutes.post('/portal', async (c) => {
  if (!stripe) return c.json(NOT_SET_UP, 503)
  const row = await readBilling(c.get('user').id)
  if (!row?.stripe_customer_id) return c.json({ error: 'No billing account yet.' }, 400)
  try {
    return c.json({ url: await portalUrl(row.stripe_customer_id) })
  } catch (err) {
    console.error('Stripe portal', err)
    return c.json({ error: 'Couldn’t open the billing portal. Try again in a moment.' }, 502)
  }
})

// ---------- Webhook ----------

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : (v?.id ?? null))

/** Recopie l'état d'un abonnement sur le compte concerné (idempotent : on écrit l'état complet, jamais un delta). */
async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = idOf(sub.customer)
  const metaUser = sub.metadata?.userId
  const [user] = metaUser
    ? await db<{ id: string; stripe_subscription_id: string | null }[]>`select id, stripe_subscription_id from users where id = ${metaUser}`
    : await db<{ id: string; stripe_subscription_id: string | null }[]>`select id, stripe_subscription_id from users where stripe_customer_id = ${customerId}`
  if (!user) {
    console.warn(`Stripe : abonnement ${sub.id} sans compte associé`)
    return
  }
  const live = LIVE_STATUSES.has(sub.status)
  // Un ancien abonnement qui se termine ne doit pas écraser l'abonnement en cours.
  if (!live && user.stripe_subscription_id && user.stripe_subscription_id !== sub.id) return

  const item = sub.items.data[0]
  const price = item?.price
  const plan: PlanId = live ? (planFromLookupKey(price?.lookup_key) ?? 'free') : 'free'
  const interval = price?.recurring?.interval ?? null
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null
  const cancelling = !!sub.cancel_at_period_end || !!sub.cancel_at
  await db`
    update users set
      plan = ${plan},
      plan_status = ${sub.status},
      plan_interval = ${interval},
      plan_period_end = ${periodEnd},
      plan_cancel_at_period_end = ${live && cancelling},
      stripe_subscription_id = ${sub.id},
      stripe_customer_id = coalesce(stripe_customer_id, ${customerId})
    where id = ${user.id}`
  await audit(null, 'billing.sync', user.id, { subscription: sub.id, status: sub.status, plan })
}

/** Toujours relire l'abonnement : les événements peuvent arriver dans le désordre. */
async function refreshSubscription(id: string, fallback?: Stripe.Subscription) {
  try {
    return await stripe!.subscriptions.retrieve(id)
  } catch (err) {
    if (fallback) return fallback
    throw err
  }
}

export const stripeWebhookRoutes = new Hono()

stripeWebhookRoutes.post('/webhook', async (c) => {
  if (!stripe || !config.stripeWebhookSecret) return c.json(NOT_SET_UP, 503)
  const signature = c.req.header('stripe-signature')
  if (!signature) return c.json({ error: 'Missing signature' }, 400)
  const payload = await c.req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, config.stripeWebhookSecret)
  } catch {
    return c.json({ error: 'Invalid signature' }, 400)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id ?? session.metadata?.userId
        const customerId = idOf(session.customer)
        if (userId && customerId) {
          await db`update users set stripe_customer_id = ${customerId} where id = ${userId} and (stripe_customer_id is null or stripe_customer_id = ${customerId})`
        }
        const subId = idOf(session.subscription)
        if (subId) await syncSubscription(await refreshSubscription(subId))
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await syncSubscription(await refreshSubscription(sub.id, sub))
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subId = idOf(invoice.parent?.subscription_details?.subscription)
        if (subId) await syncSubscription(await refreshSubscription(subId))
        break
      }
    }
  } catch (err) {
    // 500 : Stripe renverra l'événement plus tard.
    console.error(`Stripe webhook ${event.type}`, err)
    return c.json({ error: 'Webhook handler failed' }, 500)
  }
  return c.json({ received: true })
})
