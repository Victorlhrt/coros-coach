import { render, type Email } from './layout.js'

/** Modèles d'e-mails transactionnels de Raice.run. `app` est l'origine publique de l'application. */

const first = (name: string) => name.trim().split(/\s+/)[0] || 'there'

/** Libellés courts : ils tiennent sur une ligne dans les cases de métrique, même sur mobile. */
const DISTANCES: Record<string, string> = { '5k': '5 km', '10k': '10 km', half: 'Half', marathon: 'Marathon', trail: 'Trail' }
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function welcome(p: { name: string; app: string }): Email {
  return render({
    subject: 'Welcome to Raice.run',
    preheader: 'Your account is ready. Your plan is on its way.',
    blocks: [
      { kind: 'eyebrow', text: 'Welcome' },
      { kind: 'title', text: `Welcome, ${first(p.name)}.` },
      { kind: 'paragraph', text: 'Your account is ready. We’re building your plan from your answers: goal, race date, level and availability.' },
      { kind: 'paragraph', text: 'Connect your COROS watch as soon as you can: your plan adapts to your real paces and your sessions go straight to your wrist.' },
      { kind: 'button', label: 'Open my account', href: `${p.app}/account` },
    ],
  })
}

export function waitlist(p: { name: string }): Email {
  return render({
    subject: 'You’re on the Raice.run list',
    preheader: 'Beta spots are limited: we’ll email you as soon as your account is open.',
    blocks: [
      { kind: 'eyebrow', text: 'Waitlist' },
      { kind: 'title', text: `You’re in line, ${first(p.name)}.` },
      { kind: 'paragraph', text: 'Beta spots are limited so we can follow every plan closely. Your sign-up is saved, along with your answers.' },
      { kind: 'paragraph', text: 'We’ll email you as soon as your account is open. There’s nothing else to do until then.' },
    ],
  })
}

export function accountApproved(p: { name: string; app: string }): Email {
  return render({
    subject: 'Your Raice.run account is open',
    preheader: 'Your beta spot is ready. Log in to start your plan.',
    blocks: [
      { kind: 'eyebrow', text: 'Account open' },
      { kind: 'title', text: `It’s your turn, ${first(p.name)}.` },
      { kind: 'paragraph', text: 'Your beta spot is ready. Log in with the email and password you chose when you signed up: your plan starts from your answers.' },
      { kind: 'button', label: 'Log in', href: `${p.app}/login` },
    ],
  })
}

export function passwordReset(p: { name: string; url: string; minutes: number }): Email {
  return render({
    subject: 'Reset your Raice.run password',
    preheader: `Link valid for ${p.minutes} minutes.`,
    footer: 'You’re receiving this email because a password reset was requested for your account. If it wasn’t you, ignore it: your password won’t change.',
    blocks: [
      { kind: 'eyebrow', text: 'Password' },
      { kind: 'title', text: 'New password' },
      { kind: 'paragraph', text: `Hi ${first(p.name)}, here’s the link to choose a new password. It’s valid for ${p.minutes} minutes and can only be used once.` },
      { kind: 'button', label: 'Choose a password', href: p.url },
      { kind: 'note', text: 'Button not working? Copy this link into your browser:' },
      { kind: 'code', text: p.url },
    ],
  })
}

export function planReady(p: { name: string; app: string; title: string; distance: string; goalDate: string | null; weeks: number | null }): Email {
  const metrics = [
    { label: 'Goal', value: DISTANCES[p.distance] ?? p.distance },
    ...(p.weeks ? [{ label: 'Length', value: `${p.weeks} wks` }] : []),
    ...(p.goalDate ? [{ label: 'Race', value: dateFmt.format(new Date(`${p.goalDate}T00:00:00Z`)) }] : []),
  ]
  return render({
    subject: 'Your plan is ready',
    preheader: `${p.title}: your first week is waiting.`,
    blocks: [
      { kind: 'eyebrow', text: 'Plan ready' },
      { kind: 'title', text: p.title },
      { kind: 'metrics', items: metrics },
      { kind: 'paragraph', text: `${first(p.name)}, your plan is built week by week all the way to race day. Every session has its paces and recoveries, and it adjusts to how you feel.` },
      { kind: 'button', label: 'View my plan', href: `${p.app}/account` },
    ],
  })
}

/** Catalogue pour l'aperçu du back office, avec des données d'exemple. */
export function waitlistJoined(p: { name: string; position: number; shareUrl: string }): Email {
  return render({
    subject: `You’re #${p.position} on the Raice.run list`,
    preheader: 'Share your link: every friend who signs up moves you up.',
    blocks: [
      { kind: 'eyebrow', text: 'Waitlist' },
      { kind: 'title', text: `Got it, ${first(p.name)}!` },
      { kind: 'paragraph', text: `You’re #${p.position} on the list. Raice.run is invite-only, opening in small waves. Every friend who signs up with your link moves you up.` },
      { kind: 'button', label: 'Share my link', href: p.shareUrl },
    ],
  })
}

export function invited(p: { name: string; app: string; code: string }): Email {
  return render({
    subject: 'Your Raice.run invite is here',
    preheader: `Your code: ${p.code}. Create your plan now.`,
    blocks: [
      { kind: 'eyebrow', text: 'Invite' },
      { kind: 'title', text: `It’s your turn, ${first(p.name)}.` },
      { kind: 'paragraph', text: `Your access code: ${p.code}. Answer a few questions from Pacer, your coach, and your plan is ready in minutes.` },
      { kind: 'button', label: 'Create my plan', href: `${p.app}/onboarding?code=${encodeURIComponent(p.code)}` },
    ],
  })
}

/** Étape où la personne s'est arrêtée, telle qu'on la nomme dans la relance (ids de STEPS, CompleteOnboarding.tsx). */
const STOPPED_AT: Record<string, string> = {
  reason: 'You stopped at why you run.',
  watch: 'You stopped at your watch.',
  wearables: 'You stopped at your watch model.',
  connect: 'You stopped at connecting your watch.',
  nowatch: 'You stopped at your training data.',
  strava: 'You stopped at your Strava import.',
  profile: 'You stopped at your profile.',
  about: 'You stopped at a few details about you.',
  experience: 'You stopped at your running experience.',
  goal: 'You stopped at your goal.',
  target: 'You stopped at your race.',
  estimate: 'You stopped at your time estimate.',
  volume: 'You stopped at your weekly volume.',
  pains: 'You stopped at aches and pains.',
  events: 'You stopped at your recent races.',
  days: 'You stopped at your availability.',
  duration: 'You stopped at your session length.',
  gear: 'You stopped at your gear.',
  generate: 'You were one step away from your plan.',
}

/** Relance unique, 3 h après un onboarding commencé mais pas terminé. `stepId` = étape où reprendre. */
export function onboardingReminder(p: { firstName: string; resumeUrl: string; unsubscribeUrl: string; stepId: string | null }): Email {
  const name = first(p.firstName)
  const stopped = p.stepId ? STOPPED_AT[p.stepId] : undefined
  return render({
    subject: name === 'there' ? 'Your plan is waiting' : `Your plan is waiting, ${name}`,
    preheader: 'Your answers are saved. Pick up right where you left off.',
    footer: 'You’re receiving this email because you started building a plan on Raice.run. This is the only reminder we’ll send.',
    unsubscribeUrl: p.unsubscribeUrl,
    blocks: [
      { kind: 'eyebrow', text: 'Your plan' },
      { kind: 'title', text: `Hi ${name}, let’s finish your plan.` },
      { kind: 'paragraph', text: `${stopped ? `${stopped} ` : ''}Your answers are saved, so it only takes a few minutes to finish.` },
      {
        kind: 'list',
        items: [
          'A plan built around your race, your days and your real paces.',
          'Your watch data (COROS, Garmin or a Strava import) read automatically.',
          'Your plan adapts every week from how you felt.',
          'Free during early access.',
        ],
      },
      { kind: 'button', label: 'Continue where you left off', href: p.resumeUrl },
    ],
  })
}

export const CATALOG = {
  'waitlist-joined': {
    label: 'Waitlist (referral)',
    when: 'Someone joins the waitlist without a code',
    sample: (app: string) => waitlistJoined({ name: 'Camille Martin', position: 128, shareUrl: `${app}/onboarding?ref=camille7` }),
  },
  invited: { label: 'Invite', when: 'An admin invites someone from the waitlist', sample: (app: string) => invited({ name: 'Camille Martin', app, code: 'camille-x7' }) },
  welcome: { label: 'Welcome', when: 'Sign-up with an active account', sample: (app: string) => welcome({ name: 'Camille Martin', app }) },
  waitlist: { label: 'Waitlist', when: 'Sign-up while in waitlist mode', sample: () => waitlist({ name: 'Camille Martin' }) },
  'account-approved': {
    label: 'Account open',
    when: 'An admin approves a waitlisted account',
    sample: (app: string) => accountApproved({ name: 'Camille Martin', app }),
  },
  'password-reset': {
    label: 'Password reset',
    when: 'A password reset is requested',
    sample: (app: string) => passwordReset({ name: 'Camille Martin', url: `${app}/reset-password?token=exemple`, minutes: 60 }),
  },
  'onboarding-reminder': {
    label: 'Onboarding reminder',
    when: '3 h after an onboarding is started but not finished (once per lead)',
    sample: (app: string) =>
      onboardingReminder({ firstName: 'Camille', resumeUrl: `${app}/onboarding?resume=exemple`, unsubscribeUrl: `${app}/api/platform/emails/unsubscribe?token=exemple`, stepId: 'volume' }),
  },
  'plan-ready': {
    label: 'Plan ready',
    when: 'A plan moves to “Active” status',
    sample: (app: string) => planReady({ name: 'Camille Martin', app, title: 'Half marathon build', distance: 'half', goalDate: '2027-04-11', weeks: 23 }),
  },
} as const

export type TemplateId = keyof typeof CATALOG
