# Développement

[Retour au README](../README.md)

Le serveur est écrit en TypeScript pour Bun. Il parle à T3 Code et expose une API locale. Il sert aussi l'interface React, qui se trouve dans `web/`.

## Bun

Bun 1.4 ou plus récent est nécessaire. La CI utilise Bun 1.4.2.

```sh
bun install
bun run dev     # rechargement à chaud du serveur et de l'interface
bun start       # sans rechargement
bun run demo    # mode démo, avec des données inventées
bun run build   # binaire unique dans dist/t3-dashboard
```

- Une version lancée par Bun s'appelle `dev`. Elle ne cherche pas de mise à jour seule et ne contacte pas GitHub au démarrage.
- `install` et `update` refusent de tourner hors du binaire compilé. Le service pointe toujours vers ce binaire.

## Mode démo

`bun run demo` lance le dashboard avec des données inventées : projets, agents, conversations, tickets Linear et routines. Il ne contacte ni T3 Code ni Linear. Les captures d'écran de `docs/screenshots/` viennent de ce mode. Relancez-le pour refaire les captures après un changement de l'interface.

## Publier une version

1. Poussez un tag `v*`, par exemple `v0.3.0`.
2. Le workflow `release.yml` construit les 5 binaires : macOS arm64 et x64, Linux x64 et arm64, Windows x64.
3. Le workflow écrit `SHA256SUMS` et crée la release GitHub. Un tag avec un tiret (`v1.0.0-rc.1`) donne une préversion.

Un lancement manuel du workflow construit les binaires sans publier de release.

## Vérifications

```sh
bun run check       # types et tests, serveur et interface
bun run smoke       # construit le binaire et vérifie qu'il sert l'interface
bun run contracts   # lit T3 Code, Linear et GitHub, sans rien écrire
```

- La CI (`ci.yml`) lance `bun run check` et `bun run smoke` sur chaque PR et sur `main`.
- Aucun test ne contacte T3 Code. `bun run smoke` utilise un dossier temporaire et un port fermé à la place de T3.
- `bun run contracts` contacte les vrais systèmes en lecture seule : voir [contracts.md](contracts.md).

### Vérifications manuelles

Ces actions écrivent dans le vrai T3 Code. Faites-les une fois après une mise à jour de T3.

1. Créer un agent avec New Agent.
2. Envoyer un message sur un fil inactif, puis pendant un run (`steer`).
3. Arrêter un run.
4. Répondre à une approbation avec chacun des 3 boutons.
5. Répondre à une question, puis cliquer sur « Dismiss ».
6. Vérifier qu'un agent qui démarre ou finit change de carte dans l'onglet Agents sans recharger la page.
7. Déléguer une tâche depuis une conversation, puis cliquer sur « Stop » à côté de sa ligne. Vérifier dans T3 Code que la tâche et son fil enfant sont arrêtés, et que le bouton disparaît.
8. Lancer une commande shell en arrière-plan depuis une conversation, puis laisser le run finir. Vérifier que le bouton « Stop » du composer reste visible. Cliquer dessus, ou sur le bouton de la ligne de la tâche. Vérifier dans T3 Code que la tâche est arrêtée. Le dashboard arrête alors toutes les tâches de fond de la conversation.
9. Dans l'onglet Agents, vérifier que la colonne « Automations » liste les tâches planifiées de T3 Code (`scheduledTasks.list`). Un T3 trop ancien affiche une erreur dans la colonne, et la grille marche toujours.
10. Écrire « Reminder: dans 2 minutes, dis bonjour » dans le champ de la colonne, puis envoyer. Vérifier que l'agent crée la tâche avec `schedule_task`, et que le fil sort de la grille. Après le passage, vérifier que la tâche est en pause et que la ligne du rappel affiche « Finished ».

## Architecture

Le code a trois parties : le serveur (`src/`), l'interface (`web/src/`) et le contrat entre les deux (`shared/`). Les tests ont la même structure dans `test/` et `web/test/`.

### Serveur (`src/`)

| Dossier | Contenu |
| --- | --- |
| `main.ts` | Point d'entrée. Il lit les arguments et lance la bonne commande. |
| `app/` | Racine de composition. `start.ts` crée les vrais clients et les relie. `deps.ts` donne les vrais accès au disque et aux processus. |
| `cli/` | Commandes qui s'exécutent une fois : arguments, installation, service, mise à jour du binaire. |
| `config/` | Variables d'environnement, chemins, version et fichiers du dashboard (clé Linear, jeton, PID, fils des automatisations). |
| `server/` | HTTP, SSE et site statique. Le routeur lit et vérifie les requêtes (`validate.ts`), puis appelle le domaine. `htmlRender.ts` applique le thème aux pages `html_render`. |
| `domain/` | Règles et état : synchronisation avec T3, classement des fils, détail d'un fil, actions, jeton, board Linear, réglages, mises à jour, automatisations, icônes des projets, modèles. |
| `integrations/` | Tous les appels vers un autre système : T3 Code, Linear et GitHub. Chaque réponse passe par un schéma. |

### Interface (`web/src/`)

| Dossier | Contenu |
| --- | --- |
| `api/` | Client de l'API locale, flux d'évènements (`useDashboard`) et `ApiContext`. `useApi()` donne la vraie API, sauf si un `ApiProvider` en donne une autre. |
| `lib/` | Fonctions et composants partagés par plusieurs écrans. |
| `features/` | Un dossier par écran : `agents`, `desk`, `conversation`, `board`, `settings`, `setup`, `update`, `new-thread`. |
| `ui/` | Composants de base, infobulles et animations. Voir `web/src/ui/README.md`. |

### Contrat (`shared/`)

`shared/api.ts` réexporte les types de chaque thème : `threads`, `connection`, `events`, `requests`, `linear`, `settings`, `automations`. `limits.ts` contient les limites communes (images, taille des messages, modes d'exécution). `status.ts` contient le modèle de statut des fils. `events.ts` donne la liste des types d'évènements : l'interface s'abonne à cette liste.

### Règles d'import

Le test `test/architecture.test.ts` lit les imports et bloque une dépendance interdite.

- `shared/` n'importe rien.
- `config/` importe seulement `shared/`.
- `main.ts` importe `app/`, `cli/` et `config/`.
- `integrations/contract.ts`, `integrations/errors.ts` et `integrations/drift.ts` (rapport des contrats) n'importent qu'eux-mêmes.
- Une intégration importe `config/`, `shared/` et ces trois fichiers. Elle n'importe pas le domaine, le serveur ni une autre intégration.
- `domain/` importe `shared/`, `config/` et `integrations/`. Il n'importe pas `server/`, `app/` ni `cli/`.
- `server/` importe `shared/`, `domain/`, `config/` et `integrations/errors.ts`. Il passe par le domaine pour parler à T3 ou à Linear.
- `cli/` importe `config/`, `integrations/github/` et `integrations/errors.ts`.
- `app/` importe tout.
- `ui/` n'importe que `ui/`. Seule exception : `Dropdown.tsx` et `Popover.tsx` importent la logique de menu de `lib/dropdown.ts`.
- `lib/` importe `ui/`, `api/` et `shared/`. `api/` importe seulement `shared/`.
- Un écran importe `lib/`, `api/`, `ui/` et `shared/`. Il n'importe un autre écran que par un lien de la liste du test, par exemple `board` vers `new-thread`.
- L'interface n'importe jamais `src/`.

Un deuxième test (`test/integrations/boundary.test.ts`) bloque `fetch`, `WebSocket` et le lancement de processus hors de `integrations/`. Seuls `app/start.ts` et `app/deps.ts` ont une exception.

### Erreurs

- Une intégration lance une `IntegrationError` : système, type (`unreachable`, `refused`, `protocol`, `not-authenticated`) et message.
- Le domaine lance une `DomainError` : `invalid`, `not-found` ou `conflict`.
- `toHttp(error)` dans `server/httpError.ts` donne le code HTTP : 400, 404 ou 409 pour le domaine, 400 pour une clé Linear refusée, 502 pour les autres erreurs d'intégration. Une autre erreur donne 500 et va dans le log.
- Un message d'erreur ne contient jamais une clé, un jeton ni le corps d'une réponse.

## Sécurité

- Le jeton T3 et la clé Linear restent sur le serveur. Le navigateur ne les voit jamais.
- Le serveur écoute seulement sur `127.0.0.1`.
- Chaque requête vérifie les en-têtes `Host` et `Origin` : `127.0.0.1`, `localhost` ou un nom de `T3_DASHBOARD_ALLOWED_HOSTS`.
- Le serveur n'envoie aucun en-tête CORS.
- Chaque `POST` exige le type `application/json`. Ce contrôle bloque les requêtes d'un autre site (CSRF). Le corps fait 1 Mo au plus, 25 Mo pour un message avec des images.
- Les réponses interdisent l'affichage du dashboard dans le cadre d'un autre site (`X-Frame-Options: DENY`).
- Le serveur sert seulement les pièces jointes du fil et les fichiers qu'un message de l'agent cite. Il affiche les images et les vidéos. Un autre type de fichier est servi en téléchargement, jamais affiché.
- Une page `html_render` est servie avec `Content-Security-Policy: sandbox`. Ses scripts ont une origine opaque et ne peuvent pas appeler `/api`.
- L'interface ne propose pas « Toujours accepter » : seuls `accept`, `acceptForSession` et `decline` passent.
