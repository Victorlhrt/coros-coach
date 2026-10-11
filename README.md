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

## Fonctionnement

1. **Objectif** (`/#/objectif`) : distance, date, temps visé, niveau, jours dispo, sortie longue, renfo.
   « Lire mes données COROS » interroge `queryUserInfo`, `queryFitnessAssessmentOverview`,
   `queryTrainingLoadAssessment`, `queryRecoveryStatus`, `querySportRecords` puis Claude en extrait le profil
   (allure seuil, prédictions, volume) — les formats de réponse COROS ne sont pas documentés.
2. **Génération** : un appel pour la structure (phases, volumes), puis un appel par bloc de 4 semaines.
   Sortie JSON contrainte (`output_config.format` + Zod) ; si le schéma ou les règles métier (jours
   disponibles, limites COROS) ne passent pas, on relance avec la liste des erreurs (2 fois max).
3. **Envoi sur la montre** : le premier envoi crée le plan complet (`createTrainingPlan`, début entre
   aujourd'hui et J+14, 4 à 16 semaines). Les envois suivants (séance ou semaine) passent par
   `updateTrainingPlan` jour par jour ; un jour sans séance part comme repos. L'état de synchro de chaque
   séance compare son contenu avec ce qui a été envoyé. Le renforcement reste dans l'app (non pris en
   charge par COROS).
4. **Ajuster ma semaine** : récup, HRV, sommeil, FC repos, charge et activités des 7 derniers jours →
   Claude propose des remplacements / suppressions / ajouts, affichés avant/après, appliqués après accord.

5. **Profil de course** : GPX analysé dans le navigateur (distance, D+/D-, profil, montées et descentes
   marquées) ou terrain + D+ saisis ; transmis à Claude, qui adapte la préparation et rédige une stratégie de course.
6. **Volume de départ** : calculé depuis les activités COROS (4 dernières semaines, mois en cours / précédent),
   modifiable. La génération refuse un départ trop bas/haut, une hausse > 10 % et des semaines dont les
   séances ne totalisent pas le volume prévu (±15 %).
7. **Records 12 mois** (Réglages) : meilleur temps par distance via `querySportRecords` filtré par distance,
   ou saisi à la main → VDOT (Daniels), allure seuil, prédictions.
8. **Activités liées** : chaque séance passée prend automatiquement l'activité COROS du même jour la plus
   proche en distance (modifiable), avec ses splits (`queryActivityLapData`).
9. **Ressenti** : note 1-5, RPE 1-10, sensations, commentaire par séance.
10. **Bilan hebdo automatique** : à la première ouverture de chaque semaine, Claude analyse prévu/réalisé,
    splits, ressenti, récupération, HRV, sommeil et propose les ajustements (et une nouvelle allure seuil si
    besoin). Appliquer reste un geste explicite, l'envoi sur la montre demande confirmation.

`npm run check` lance les tests hors ligne (payload COROS, analyse GPX, VDOT, règles de volume, liaison auto).

## Structure

```
src/
  lib/coros/   client MCP, fournisseur OAuth, écriture confirmée + journal, hooks
  lib/coach/   prompts, schémas Zod, génération, ajustement, zones, calculs
  lib/store/   réglages (Zustand persisté)
  components/  UI (style shadcn/ui), barre d'onglets, feuille de confirmation
  pages/       Aujourd'hui, Plan, Historique, Réglages, Debug
```
