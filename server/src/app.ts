import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { authRoutes } from './auth.js'
import { claudeRoutes } from './claude.js'
import { config } from './config.js'
import { migrate } from './db.js'
import { accountRoutes } from './platform/account.js'
import { adminRoutes } from './platform/admin.js'
import { platformAuthRoutes } from './platform/auth.js'
import { migratePlatform } from './platform/db.js'
import { lookupRoutes } from './platform/lookup.js'
import { inviteRoutes } from './platform/invites.js'
import { connectRoutes } from './platform/connect.js'
import { onboardingRoutes } from './platform/onboarding.js'
import { requireCoachAccess, stateRoutes } from './state.js'

const app = new Hono()

app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: undefined }))

// Défense CSRF en plus du cookie SameSite=Lax : toute écriture doit venir de l'app elle-même.
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin')
    if (origin && origin !== config.origin) return c.json({ error: 'Origine refusée.' }, 403)
  }
  await next()
})

app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', authRoutes)

app.use('/api/state', requireCoachAccess, bodyLimit({ maxSize: 5 * 1024 * 1024 }))
app.route('/api/state', stateRoutes)

app.use('/api/claude/*', requireCoachAccess, bodyLimit({ maxSize: 2 * 1024 * 1024 }))
app.route('/api/claude', claudeRoutes)

// Plateforme multi-utilisateur : comptes, onboardings, back office.
app.use('/api/platform/*', bodyLimit({ maxSize: 256 * 1024 }))
app.route('/api/platform/auth', platformAuthRoutes)
app.route('/api/platform/onboarding', onboardingRoutes)
app.route('/api/platform/lookup', lookupRoutes)
app.route('/api/platform/invites', inviteRoutes)
app.route('/api/platform/connect', connectRoutes)
app.route('/api/platform/admin', adminRoutes)
app.route('/api/platform/account', accountRoutes)

app.all('/api/*', (c) => c.json({ error: 'Introuvable' }, 404))

// Sur l'app, la racine mène à l'espace connecté : la landing vit sur son propre service (SITE_ROLE=landing).
app.get('/', (c) => c.redirect('/account'))

// Front Vite compilé : toute URL hors API sert index.html (site et back office en BrowserRouter, coach sous /app/ en HashRouter).
app.use('/*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

await migrate()
await migratePlatform()
serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Coach COROS sur :${info.port} (origine ${config.origin}, rpID ${config.rpID})`)
})
