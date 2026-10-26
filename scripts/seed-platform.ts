/**
 * Données de démonstration pour le back office, en local uniquement :
 *   PLATFORM_DATABASE_URL=postgres://localhost/coach_platform npx tsx scripts/seed-platform.ts
 * Les comptes créés ont des e-mails en @demo.paice.run ; `--purge` les supprime (plans et parcours compris).
 */
import postgres from 'postgres'

const url = process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) throw new Error('PLATFORM_DATABASE_URL manquante')
if (process.env.NODE_ENV === 'production' || /railway|rlwy/.test(url)) throw new Error('Refusé : ce script ne tourne que sur une base locale.')

const db = postgres(url, { onnotice: () => {} })
const DOMAIN = 'demo.paice.run'

await db`delete from onboarding_sessions where user_id in (select id from users where email like ${`%@${DOMAIN}`})`
await db`delete from users where email like ${`%@${DOMAIN}`}`
if (process.argv.includes('--purge')) {
  console.log('Données de démo supprimées.')
  await db.end()
  process.exit(0)
}

const FIRST = ['Camille', 'Lucas', 'Léa', 'Hugo', 'Chloé', 'Nathan', 'Manon', 'Théo', 'Inès', 'Louis', 'Jade', 'Arthur', 'Zoé', 'Jules', 'Emma']
const LAST = ['Martin', 'Bernard', 'Dubois', 'Durand', 'Lefebvre', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garcia']
const SOURCES = ['instagram', 'instagram', 'strava', 'direct', 'direct', 'google', 'newsletter']
const DISTANCES = ['5k', '10k', '10k', 'half', 'half', 'half', 'marathon', 'marathon', 'trail']
const LEVELS = ['beginner', 'intermediate', 'intermediate', 'advanced']
const VARIANTS = ['classique', 'express']
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

let users = 0
for (let i = 0; i < 160; i++) {
  const daysAgo = Math.floor(Math.pow(Math.random(), 0.7) * 84)
  const created = new Date(Date.now() - daysAgo * 86400_000 - Math.random() * 86400_000)
  const variant = pick(VARIANTS)
  const steps = variant === 'classique' ? 5 : 3
  // L'express convertit mieux : c'est ce que le tableau de bord doit faire ressortir.
  const completed = Math.random() < (variant === 'express' ? 0.72 : 0.55)
  const reached = completed ? steps : Math.floor(Math.random() * steps)
  const answers = { distance: pick(DISTANCES), level: pick(LEVELS), race_date: new Date(Date.now() + (40 + Math.random() * 180) * 86400_000).toISOString().slice(0, 10) }

  let userId: string | null = null
  if (completed && Math.random() < 0.8) {
    const name = `${pick(FIRST)} ${pick(LAST)}`
    const [u] = await db<{ id: string }[]>`
      insert into users (email, name, password_hash, status, source, onboarding_variant, created_at, last_login_at)
      values (${`${name.toLowerCase().replace(/\W+/g, '.')}.${i}@${DOMAIN}`}, ${name}, 'demo', ${Math.random() < 0.1 ? 'waitlist' : 'active'},
              ${pick(SOURCES)}, ${variant}, ${created}, ${Math.random() < 0.6 ? new Date(Date.now() - Math.random() * 10 * 86400_000) : null})
      returning id`
    userId = u.id
    users++
  }
  const [s] = await db<{ id: string }[]>`
    insert into onboarding_sessions (variant_id, user_id, answers, step_reached, completed_at, created_at, updated_at)
    values (${variant}, ${userId}, ${db.json(answers)}, ${reached}, ${completed ? created : null}, ${created}, ${created})
    returning id`
  if (userId) {
    const weeks = Math.round((Date.parse(answers.race_date) - Date.now()) / (7 * 86400_000))
    await db`
      insert into plans (user_id, onboarding_session_id, title, goal_distance, goal_date, level, weeks, status, data, created_at)
      values (${userId}, ${s.id}, ${`Préparation ${answers.distance}`}, ${answers.distance}, ${answers.race_date}, ${answers.level}, ${weeks},
              ${pick(['requested', 'requested', 'active', 'active', 'active', 'failed'])}, ${db.json({ answers, demo: true })}, ${created})`
  }
}
console.log(`${users} comptes de démo créés (@${DOMAIN}).`)
await db.end()
