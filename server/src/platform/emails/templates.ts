import { render, type Email } from './layout.js'

/** Modèles d'e-mails transactionnels de Raice.run. `app` est l'origine publique de l'application. */

const first = (name: string) => name.trim().split(/\s+/)[0] || 'toi'

/** Libellés courts : ils tiennent sur une ligne dans les cases de métrique, même sur mobile. */
const DISTANCES: Record<string, string> = { '5k': '5 km', '10k': '10 km', half: 'Semi', marathon: 'Marathon', trail: 'Trail' }
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function welcome(p: { name: string; app: string }): Email {
  return render({
    subject: 'Bienvenue sur Raice.run',
    preheader: 'Ton compte est prêt. Ton plan est en préparation.',
    blocks: [
      { kind: 'eyebrow', text: 'Bienvenue' },
      { kind: 'title', text: `Bienvenue, ${first(p.name)}.` },
      { kind: 'paragraph', text: 'Ton compte est prêt. On prépare ton plan à partir de tes réponses : objectif, date de course, niveau et disponibilités.' },
      { kind: 'paragraph', text: 'Connecte ta montre COROS dès que possible : le plan se cale sur tes allures réelles et tes séances arrivent directement au poignet.' },
      { kind: 'button', label: 'Ouvrir mon espace', href: `${p.app}/compte` },
    ],
  })
}

export function waitlist(p: { name: string }): Email {
  return render({
    subject: 'Tu es sur la liste Raice.run',
    preheader: 'Les places de la bêta sont limitées : on t’écrit dès que ton compte est ouvert.',
    blocks: [
      { kind: 'eyebrow', text: 'Liste d’attente' },
      { kind: 'title', text: `C’est noté, ${first(p.name)}.` },
      { kind: 'paragraph', text: 'Les places de la bêta sont limitées pour qu’on puisse suivre chaque plan de près. Ton inscription est enregistrée, avec tes réponses.' },
      { kind: 'paragraph', text: 'On t’écrit dès que ton compte est ouvert. Il n’y a rien d’autre à faire d’ici là.' },
    ],
  })
}

export function accountApproved(p: { name: string; app: string }): Email {
  return render({
    subject: 'Ton compte Raice.run est ouvert',
    preheader: 'Ta place dans la bêta est prête. Connecte-toi pour lancer ton plan.',
    blocks: [
      { kind: 'eyebrow', text: 'Compte ouvert' },
      { kind: 'title', text: `C’est ton tour, ${first(p.name)}.` },
      { kind: 'paragraph', text: 'Ta place dans la bêta est prête. Connecte-toi avec l’e-mail et le mot de passe choisis à l’inscription : ton plan démarre à partir de tes réponses.' },
      { kind: 'button', label: 'Me connecter', href: `${p.app}/connexion` },
    ],
  })
}

export function passwordReset(p: { name: string; url: string; minutes: number }): Email {
  return render({
    subject: 'Réinitialise ton mot de passe Raice.run',
    preheader: `Lien valable ${p.minutes} minutes.`,
    footer: 'Tu reçois cet e-mail parce qu’une réinitialisation a été demandée pour ton compte. Si ce n’est pas toi, ignore-le : ton mot de passe ne change pas.',
    blocks: [
      { kind: 'eyebrow', text: 'Mot de passe' },
      { kind: 'title', text: 'Nouveau mot de passe' },
      { kind: 'paragraph', text: `Bonjour ${first(p.name)}, voici le lien pour choisir un nouveau mot de passe. Il est valable ${p.minutes} minutes et ne sert qu’une fois.` },
      { kind: 'button', label: 'Choisir un mot de passe', href: p.url },
      { kind: 'note', text: 'Le bouton ne marche pas ? Copie ce lien dans ton navigateur :' },
      { kind: 'code', text: p.url },
    ],
  })
}

export function planReady(p: { name: string; app: string; title: string; distance: string; goalDate: string | null; weeks: number | null }): Email {
  const metrics = [
    { label: 'Objectif', value: DISTANCES[p.distance] ?? p.distance },
    ...(p.weeks ? [{ label: 'Durée', value: `${p.weeks} sem.` }] : []),
    ...(p.goalDate ? [{ label: 'Course', value: dateFmt.format(new Date(`${p.goalDate}T00:00:00Z`)) }] : []),
  ]
  return render({
    subject: 'Ton plan est prêt',
    preheader: `${p.title} : la première semaine t’attend.`,
    blocks: [
      { kind: 'eyebrow', text: 'Plan prêt' },
      { kind: 'title', text: p.title },
      { kind: 'metrics', items: metrics },
      { kind: 'paragraph', text: `${first(p.name)}, ton plan est construit semaine par semaine jusqu’au jour J. Chaque séance a ses allures et ses récupérations ; il s’ajuste ensuite selon tes sensations.` },
      { kind: 'button', label: 'Voir mon plan', href: `${p.app}/compte` },
    ],
  })
}

/** Catalogue pour l'aperçu du back office, avec des données d'exemple. */
export const CATALOG = {
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
    sample: (app: string) => passwordReset({ name: 'Camille Martin', url: `${app}/reinitialiser?token=exemple`, minutes: 60 }),
  },
  'plan-ready': {
    label: 'Plan prêt',
    when: 'Un plan passe au statut « Actif »',
    sample: (app: string) => planReady({ name: 'Camille Martin', app, title: 'Préparation Semi-marathon', distance: 'half', goalDate: '2027-04-11', weeks: 23 }),
  },
} as const

export type TemplateId = keyof typeof CATALOG
