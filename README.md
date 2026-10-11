# Coach COROS

Coach course à pied perso : plans générés par Claude, poussés sur la montre via le MCP officiel COROS.
Web app mobile-first (Chrome sur iPhone), hébergée sur GitHub Pages, **sans backend**.

## Lancer en local

```bash
npm install
npm run dev
```

Ouvrir **http://localhost:5173/coros-coach/** (le chemin `/coros-coach/` est aussi utilisé en dev
pour que l'URL de retour OAuth soit la même forme qu'en prod).

Écran de debug MCP : `/#/debug` (lien discret en bas de Réglages) — liste les outils exposés par
COROS avec leurs schémas, permet d'appeler les outils de lecture.

## OAuth COROS

Rien à configurer : tout se fait dans le navigateur.

| Élément | Valeur |
|---|---|
| Serveur MCP | `https://mcpeu.coros.com/mcp` (Streamable HTTP, sans session) |
| Serveur d'autorisation | `https://mcpeu.coros.com` (découvert via `/.well-known/oauth-protected-resource/mcp`) |
| Client | enregistré dynamiquement (`/connect/register`), client public, `token_endpoint_auth_method: none` |
| Flux | Authorization Code + PKCE S256, `resource=https://mcpeu.coros.com/mcp` |
| Scopes | `openid mcp.tools offline_access` (le dernier donne le `refresh_token`) |
| URL de retour | `${origin}/coros-coach/` — l'app lit `?code=&state=` au chargement |

On utilise `mcpeu` et non `mcp.coros.com` : ce dernier répond mais annonce la ressource `mcpeu`,
ce que le SDK MCP refuse. CORS est ouvert sur MCP, token et DCR : **aucun proxy n'est nécessaire**.

Le client est enregistré une fois par URL de retour (localhost et GitHub Pages ont chacun le leur).
Tokens, client et état OAuth sont en `localStorage` (`coros.*`).

### Écritures sur COROS

Toute écriture passe par `corosWrite()` (`src/lib/coros/client.ts`) : confirmation obligatoire,
puis journal (visible dans `/#/debug`). `corosRead()` refuse les outils d'écriture.

## Claude

Clé API Anthropic saisie dans Réglages, stockée en `localStorage`, appels directs depuis le
navigateur (`anthropic-dangerous-direct-browser-access`). Modèle par défaut : `claude-haiku-4-5`
(le moins cher, 1 $ / 5 $ par million de tokens) ; Sonnet 5 sélectionnable dans Réglages.
Utiliser une clé dédiée avec une limite de dépense.

## Déploiement GitHub Pages

1. Pousser sur `main` d'un dépôt nommé **`coros-coach`** (sinon changer `base` dans `vite.config.ts`).
2. Dans le dépôt : *Settings → Pages → Source : GitHub Actions*.
3. Le workflow `.github/workflows/deploy.yml` lint, build et publie `dist/`.

L'app est servie sur `https://<utilisateur>.github.io/coros-coach/`. Ajout à l'écran d'accueil :
Partager → « Sur l'écran d'accueil ».

## Structure

```
src/
  lib/coros/   client MCP, fournisseur OAuth, écriture confirmée + journal, hooks
  lib/coach/   prompts + schémas Zod (à venir)
  lib/store/   réglages (Zustand persisté)
  components/  UI (style shadcn/ui), barre d'onglets, feuille de confirmation
  pages/       Aujourd'hui, Plan, Historique, Réglages, Debug
```
