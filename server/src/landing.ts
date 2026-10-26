import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

/** Service de la landing (raice.run) : sert la page d'accueil, renvoie tout le reste vers l'application. */
const appUrl = (process.env.APP_URL ?? 'https://app.raice.run').replace(/\/$/, '')
const port = Number(process.env.PORT ?? 8788)

const landing = new Hono()
landing.use('*', secureHeaders({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: undefined }))
landing.get('/api/health', (c) => c.json({ ok: true, role: 'landing' }))

// Fichiers du build (scripts, styles, icônes, manifest) puis la page d'accueil elle-même.
landing.use('/assets/*', serveStatic({ root: './dist' }))
landing.get('/', serveStatic({ path: './dist/index.html' }))
landing.use('/*', serveStatic({ root: './dist' }))

// Connexion, inscription, onboarding, back office, coach… : tout vit sur l'application.
landing.all('*', (c) => {
  const url = new URL(c.req.url)
  return c.redirect(`${appUrl}${url.pathname}${url.search}`, 302)
})

serve({ fetch: landing.fetch, port }, (info) => {
  console.log(`Landing Raice.run sur :${info.port}, application sur ${appUrl}`)
})
