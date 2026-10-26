# Paice.run (plateforme) + Coach COROS (personnel)

## Plateforme Paice.run

Même build, même serveur, deux applications :

| URL | Contenu |
|---|---|
| `/` | landing (bloc Efferd `hero-2`) |
| `/onboarding` | parcours d'onboarding tiré au sort parmi les parcours en ligne (test A/B) ; `?variant=<id>&preview=1` pour tester sans fausser les stats |
| `/inscription`, `/connexion` | blocs Arc `signup-form` et `login-centered` (e-mail + mot de passe) |
| `/compte` | espace coureur minimal (demandes de plan) |
| `/admin` | back office (bloc Efferd `app-shell-2`, graphiques Arc) : vue d'ensemble, inscriptions, onboardings, plans, accès et réglages, journal |
| `/app/` | le coach personnel ci-dessous (passkey, COROS) |

- Serveur : `server/src/platform/` (comptes scrypt + cookie `psid`, onboarding, API admin journalisée).
- Base dédiée : service Postgres `Postgres-6v2F` du projet Railway RunningAPP, via `PLATFORM_DATABASE_URL`
  (sinon `DATABASE_URL`). Tables créées au démarrage.
- Administrateurs : les e-mails de `ADMIN_EMAILS` (séparés par des virgules) deviennent admin à l'inscription ou à la connexion.
- Composants shadcn de la plateforme dans `src/components/shadcn` (le `button` historique du coach reste dans `src/components/ui`).
- Données de démo en local : `PLATFORM_DATABASE_URL=postgres://localhost/coach_platform npm run seed:platform` (`-- --purge` pour les retirer).


Coach course à pied perso : plans générés par Claude, poussés sur la montre via le MCP officiel COROS.
Web app mobile-first (Chrome sur iPhone), hébergée sur GitHub Pages, **sans backend**.

## Architecture

- **Front** Vite/React (dossier `src/`), servi à la racine par le serveur.
- **Serveur** Node + Hono (`server/src/`), hébergé sur **Railway** avec **Postgres** :
  - connexion par **passkey** (Face ID / Touch ID) vérifiée côté serveur, sans email ;
  - relais **Claude** `/api/claude/v1/messages` : la clé reste dans `ANTHROPIC_API_KEY` ;
  - **état de l'app** (plan, ressentis, records, liaisons, réglages) en un document JSON versionné,
    synchronisé entre appareils (`/api/state`, conflit → la version du serveur gagne).
- La connexion **COROS** reste par appareil pour l'instant (tokens dans le coffre local).

### Variables d'environnement (service Railway)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ANTHROPIC_API_KEY` | clé API Anthropic |
| `SETUP_CODE` | code demandé pour créer un passkey sans être connecté (1er appareil) |
| `NODE_ENV` | `production` |
| `PLATFORM_DATABASE_URL` | `${{Postgres-6v2F.DATABASE_URL}}` (base de la plateforme) |
| `ADMIN_EMAILS` | e-mails administrateurs du back office |
| `PUBLIC_ORIGIN` | facultatif : origine publique si domaine personnalisé (sinon `RAILWAY_PUBLIC_DOMAIN`) |

Le rpID WebAuthn est le nom d'hôte de l'origine publique : changer de domaine invalide les passkeys existants.

## Lancer en local

```bash
npm install
# Postgres local, puis :
DATABASE_URL=postgres://localhost/coach SETUP_CODE=dev ANTHROPIC_API_KEY=sk-ant-… npm run dev:server
npm run dev   # http://localhost:5173, /api relayé vers :8787
```

## OAuth COROS

Rien à configurer : tout se fait dans le navigateur.

| Élément | Valeur |
|---|---|
| Serveur MCP | `https://mcpeu.coros.com/mcp` (Streamable HTTP, sans session) |
| Serveur d'autorisation | `https://mcpeu.coros.com` (découvert via `/.well-known/oauth-protected-resource/mcp`) |
| Client | enregistré dynamiquement (`/connect/register`), client public, `token_endpoint_auth_method: none` |
| Flux | Authorization Code + PKCE S256, `resource=https://mcpeu.coros.com/mcp` |
| Scopes | `openid mcp.tools offline_access` (le dernier donne le `refresh_token`) |
| URL de retour | `${origin}/app/` — l'app lit `?code=&state=` au chargement |

On utilise `mcpeu` et non `mcp.coros.com` : ce dernier répond mais annonce la ressource `mcpeu`,
ce que le SDK MCP refuse. CORS est ouvert sur MCP, token et DCR : **aucun proxy n'est nécessaire**.

Le client est enregistré une fois par URL de retour (localhost et GitHub Pages ont chacun le leur).
Tokens, client et état OAuth sont en `localStorage` (`coros.*`).

### Écritures sur COROS

Toute écriture passe par `corosWrite()` (`src/lib/coros/client.ts`) : confirmation obligatoire,
puis journal (visible dans `/#/debug`). `corosRead()` refuse les outils d'écriture.

## Coffre local (tokens COROS)

Les tokens et le client OAuth COROS de l'appareil sont dans un coffre local (`src/lib/lock/vault.ts`, clé `vault.v1`).
Le verrou local (Face ID / code) reste disponible pour qui l'avait activé ; la connexion au serveur le rend facultatif.

- Une clé de données aléatoire (AES-GCM 256) chiffre le coffre.
- Elle est chiffrée par le **code de secours** (PBKDF2-SHA256, 600 000 itérations, délai croissant après erreur)
  et, si le navigateur prend en charge l'extension WebAuthn **PRF**, par un **passkey Face ID** : la sortie PRF
  (HKDF) sert de clé. Sans PRF, Face ID ne protégerait rien côté navigateur : seul le code est proposé.
- Verrouillage au lancement et après N minutes en arrière-plan. Code oublié → les secrets sont effacés, le plan reste.
- Sans verrou, le coffre est stocké en clair (comportement d'avant). Les anciennes clés en clair sont migrées
  au premier lancement.

Attention sur iPhone : l'icône de l'écran d'accueil et le navigateur ont des stockages séparés.

## Claude

Appels via le relais du serveur (la clé n'est jamais sur l'appareil). Modèle par défaut : `claude-haiku-4-5`
(le moins cher, 1 $ / 5 $ par million de tokens) ; Sonnet 5 sélectionnable dans Réglages.
Utiliser une clé dédiée avec une limite de dépense.

## Déploiement

Railway déploie la branche `main` (build `npm run build`, démarrage `npm start`, healthcheck
`/api/health`, voir `railway.json`). GitHub Actions lance seulement lint, tests et build.

## Structure

```
src/
  lib/coros/   client MCP, fournisseur OAuth, écriture confirmée + journal, hooks
  lib/coach/   prompts, schémas Zod, génération, ajustement, zones, calculs
  lib/store/   réglages (Zustand persisté)
  components/  UI (style shadcn/ui), barre d'onglets, feuille de confirmation
  pages/       Aujourd'hui, Plan, Historique, Réglages, Debug
```
