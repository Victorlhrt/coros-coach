/**
 * Un seul build, deux services Railway :
 * - SITE_ROLE=landing : la page d'accueil (raice.run), sans base de données ;
 * - sinon : l'application (app.raice.run) avec l'API, le back office, l'onboarding et le coach.
 */
if (process.env.SITE_ROLE === 'landing') await import('./landing.js')
else await import('./app.js')
