import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { authRoutes, requireAuth } from './auth.js'
import { claudeRoutes } from './claude.js'
import { config } from './config.js'
import { migrate } from './db.js'
import { stateRoutes } from './state.js'

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

app.use('/api/state', requireAuth, bodyLimit({ maxSize: 5 * 1024 * 1024 }))
app.route('/api/state', stateRoutes)

app.use('/api/claude/*', requireAuth, bodyLimit({ maxSize: 2 * 1024 * 1024 }))
app.route('/api/claude', claudeRoutes)

app.all('/api/*', (c) => c.json({ error: 'Introuvable' }, 404))

// Front Vite compilé. L'app utilise un HashRouter : seule la racine sert index.html.
app.use('/*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

await migrate()
serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Coach COROS sur :${info.port} (origine ${config.origin}, rpID ${config.rpID})`)
})
