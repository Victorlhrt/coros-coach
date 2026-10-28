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

export const CATALOG = {
  'waitlist-joined': {
    label: 'Liste d’attente (parrainage)',
    when: 'Inscription sur la liste d’attente sans code',
    sample: (app: string) => waitlistJoined({ name: 'Camille Martin', position: 128, shareUrl: `${app}/onboarding?ref=camille7` }),
  },
  invited: { label: 'Invitation', when: 'Un admin invite une personne de la liste', sample: (app: string) => invited({ name: 'Camille Martin', app, code: 'camille-x7' }) },
  welcome: { label: 'Bienvenue', when: 'Inscription avec compte actif', sample: (app: string) => welcome({ name: 'Camille Martin', app }) },
  waitlist: { label: 'Liste d’attente', when: 'Inscription en mode liste d’attente', sample: () => waitlist({ name: 'Camille Martin' }) },
  'account-approved': {
    label: 'Compte ouvert',
    when: 'Un admin valide un compte en liste d’attente',
    sample: (app: string) => accountApproved({ name: 'Camille Martin', app }),
  },
  'password-reset': {
    label: 'Mot de passe oublié',
    when: 'Demande de réinitialisation',
    sample: (app: string) => passwordReset({ name: 'Camille Martin', url: `${app}/reset-password?token=exemple`, minutes: 60 }),
  },
  'plan-ready': {
    label: 'Plan prêt',
    when: 'Un plan passe au statut « Actif »',
    sample: (app: string) => planReady({ name: 'Camille Martin', app, title: 'Half marathon build', distance: 'half', goalDate: '2027-04-11', weeks: 23 }),
  },
} as const

export type TemplateId = keyof typeof CATALOG
