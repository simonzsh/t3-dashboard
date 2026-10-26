# t3-dashboard

Dashboard web local pour gérer les threads et les agents de T3 Code. Il tourne en arrière-plan et s'ouvre dans le navigateur.

- **Agents** : une carte par session T3 Code, regroupées par projet. Une colonne « Automatisations » (lecture seule) liste les routines et les rappels des cerveaux t3-agent. Elle n'apparaît que si un cerveau existe. Les agents qui attendent l'utilisateur passent en haut. Un clic ouvre la conversation : envoi de message, interruption, réponse aux approbations et aux questions.
- **Board** : les tickets Linear qui vous sont assignés, groupés par projet Linear. Un clic ouvre le ticket dans Linear. Le bouton « assigner à un agent » crée une session T3 Code (Claude ou Codex) qui traite le ticket.

Le serveur Bun (TypeScript) parle à T3 Code et expose une API locale. Il sert aussi l'interface React, qui se trouve dans `web/`.

## Installation

Prérequis : T3 Code installé et lancé.

macOS et Linux :

```sh
curl -fsSL https://raw.githubusercontent.com/simonzsh/t3-dashboard/main/install.sh | sh
```

Windows (PowerShell) :

```powershell
irm https://raw.githubusercontent.com/simonzsh/t3-dashboard/main/install.ps1 | iex
```

Le script télécharge le binaire, vérifie sa somme SHA-256 et le place dans `~/.local/bin` (Windows : `%LOCALAPPDATA%\Programs\t3-dashboard`). Il lance ensuite `t3-dashboard install`. Cette commande enregistre le service, le démarre et ouvre `http://127.0.0.1:4300`.

Tant que le repo GitHub est privé, ces adresses répondent 404. L'installation en une commande marche après le passage du repo en public.

Options du script : `T3_DASHBOARD_VERSION=1.2.3` fixe la version, `T3_DASHBOARD_INSTALL_DIR` change le dossier du binaire (macOS et Linux), `T3_DASHBOARD_NO_SERVICE=1` installe le binaire sans service.

### Service

| | Mécanisme |
|---|---|
| macOS | LaunchAgent `~/Library/LaunchAgents/t3-dashboard.plist` |
| Linux | unité `systemd --user` : `~/.config/systemd/user/t3-dashboard.service` |
| Windows | tâche planifiée « T3 Dashboard » à l'ouverture de session |

- Le service redémarre seul après une panne.
- `install` copie dans le service les variables définies au moment de l'installation : `T3_DASHBOARD_TOKEN_FILE`, `T3_DASHBOARD_CONFIG_DIR`, `T3_DASHBOARD_LINEAR_FILE`, `T3_DASHBOARD_AGENT_CONFIG_DIR`, `T3_DASHBOARD_T3_BIN`, `T3_DASHBOARD_ALLOWED_HOSTS`, `T3_SERVER_RUNTIME` et `T3CODE_HOME`. Pour changer une valeur, définissez la variable et relancez `install`.
- `install` et `update` attendent que le nouveau binaire réponde sur le port. Si un autre programme ou un ancien dashboard tient le port, la commande s'arrête avec une erreur : « Port 4300 is used by another program or an older dashboard. » Arrêtez ce programme, ou installez avec `--port <n>`.
- Sous Linux, exécutez `loginctl enable-linger $USER` pour démarrer le service au boot, sans ouvrir de session.
- Sous Windows, la tâche n'a pas besoin de droits d'administrateur. Si Windows la refuse, l'installeur utilise la clé `Run` de l'utilisateur.
- Sous Windows, les droits de fichier (mode 600) ne s'appliquent pas. Le dossier de config reste dans votre profil.

### Commandes

```sh
t3-dashboard install [--port 4300] [--no-open]   # enregistre et démarre le service
t3-dashboard uninstall                           # arrête et retire le service, garde la config
t3-dashboard update [--check]                    # installe la dernière release
t3-dashboard start [--port 4300] [--log <fichier>]   # lance au premier plan, sans service
t3-dashboard --version
```

### Mise à jour

```sh
t3-dashboard update
```

La commande télécharge la dernière release GitHub, vérifie la somme SHA-256, remplace le binaire et redémarre le service. Avec `--check`, elle indique seulement si une version plus récente existe.

#### Depuis le dashboard

Le dashboard cherche une nouvelle release au démarrage, puis une fois par jour. Une erreur réseau ou l'absence de release n'affiche rien.

Le dashboard cherche une nouvelle version au démarrage, puis toutes les heures. Quand une version plus récente existe, le bouton « Update vX.Y.Z » apparaît dans l'en-tête. Cliquez dessus, puis confirmez. Le dashboard fait la même mise à jour que `t3-dashboard update`, puis redémarre. La page attend le nouveau dashboard et se recharge seule. Si la mise à jour échoue, la page affiche l'erreur.

Les réglages ont une section « About » : version installée, dernière version connue, bouton « Check for updates ».

- Un dashboard lancé avec `start` se relance seul avec les mêmes arguments.
- Une version `dev` ou un dashboard lancé hors du binaire compilé ne se met pas à jour : la page l'explique.
- Aucune mise à jour ne se fait sans clic.

### Désinstallation

1. `t3-dashboard uninstall`
2. Supprimez le binaire : `rm ~/.local/bin/t3-dashboard`.
3. Supprimez la config si vous le voulez : `rm -r ~/.config/t3-dashboard`.

### Logs

| | Où |
|---|---|
| Linux | `journalctl --user -u t3-dashboard -f` |
| macOS | `~/Library/Logs/t3-dashboard/dashboard.log` |
| Windows | `%LOCALAPPDATA%\t3-dashboard\dashboard.log` |

Les logs ne contiennent jamais de jeton ni de clé API. Le fichier `dashboard.pid` se trouve dans le même dossier que le log (Linux : `~/.local/state/t3-dashboard`).

## Premier lancement

1. Le dashboard cherche `t3` et crée son propre jeton avec `t3 auth session issue`. Il le garde dans `~/.config/t3-dashboard/auth.json` (mode 600). Vous ne faites rien.
2. Si T3 Code est arrêté ou absent, un écran plein explique quoi faire. Lancez T3 Code ou installez-le, puis cliquez sur « Retry ». Le dashboard s'affiche sans recharger la page.
3. Si la création du jeton échoue, l'écran donne la commande exacte à copier et un champ pour coller le jeton.
4. Dans l'onglet Board, une carte explique comment connecter Linear (voir ci-dessous).

## Linear

Tout se règle depuis le dashboard.

1. Dans Linear, ouvrez Settings, Account, Security & access, puis « Personal API keys » et « New API key ». Lien direct : <https://linear.app/settings/account/security>.
2. Dans l'onglet Board, collez la clé et cliquez sur « Connect ». Le serveur vérifie la clé auprès de Linear avant de l'enregistrer.
3. Dans Settings, la section Linear montre l'état de la clé. Elle permet de la changer ou de la retirer.

La clé est le seul réglage. Le Board affiche les tickets assignés de toutes les équipes de l'espace Linear. Si la clé couvre plusieurs entreprises, leurs tickets s'affichent ensemble.

À l'assignation, le menu demande le projet T3, puis l'agent (Claude ou Codex). Le navigateur retient le dernier projet choisi pour chaque équipe et le présélectionne. Ce souvenir reste dans le `localStorage` du navigateur, pas sur le serveur.

Le serveur garde la clé dans `~/.config/t3-dashboard/linear.json` (mode 600). Il ne la renvoie jamais au navigateur, seulement les 4 derniers caractères au plus. Il garde les tickets 60 s ; `GET /api/board?refresh=1` force la relecture.

Format du fichier :

```json
{ "apiKey": "lin_api_..." }
```

- Un ancien fichier peut contenir `teams` et `unlisted`. Le serveur les ignore et les supprime à la prochaine écriture.
- L'ancien format `{ "workspaces": [...] }` se lit encore : le serveur prend la première clé non vide et ignore les autres. Le Board ne montre que les tickets de cette clé. Le premier enregistrement depuis Settings écrit le format simple.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `4300` | Port local. L'écoute reste sur `127.0.0.1`. `--port` l'emporte. Une valeur vide, invalide ou `0` donne `4300`. |
| `T3_DASHBOARD_CONFIG_DIR` | `~/.config/t3-dashboard` | Dossier de `auth.json` et de `linear.json`. |
| `T3_DASHBOARD_TOKEN_FILE` | aucun | Fichier JSON avec le champ `token`. Sans lui, le dashboard garde son propre jeton. Avec lui, l'écran de réglage refuse un jeton collé : mettez-le dans ce fichier. |
| `T3_DASHBOARD_ALLOWED_HOSTS` | aucun | Noms d'hôte séparés par des virgules, sans port. Ils s'ajoutent à `127.0.0.1` et `localhost` pour les en-têtes `Host` et `Origin`. Exemple : `box.tailnet.ts.net` derrière `tailscale serve`. Le dashboard n'a pas d'authentification : n'ouvrez que des réseaux privés. |
| `T3_DASHBOARD_T3_BIN` | recherche auto | Chemin absolu de `t3`. |
| `T3_DASHBOARD_LINEAR_FILE` | `<config>/linear.json` | Fichier de la config Linear. |
| `T3_DASHBOARD_AGENT_CONFIG_DIR` | `~/.config/t3-agent` | Dossier des configs t3-agent, un `*.json` par cerveau. |
| `T3_SERVER_RUNTIME` | `~/.t3/userdata/server-runtime.json` | Fichier JSON avec le champ `origin`, relu à chaque connexion à T3. Repli : `http://127.0.0.1:3773`. |
| `T3_DASHBOARD_REPO` | `simonzsh/t3-dashboard` | Repo GitHub des releases, pour `update` et les scripts. |

## Développement avec Bun

Bun 1.4 ou plus récent est nécessaire.

```sh
bun install
bun run dev     # interface avec rechargement à chaud, serveur relancé à chaque changement
bun start       # sans rechargement
bun run build   # binaire unique dans dist/t3-dashboard
```

`install` et `update` refusent de tourner hors du binaire compilé. Le service pointe toujours vers ce binaire.

Pour publier : poussez un tag `v*`. Le workflow `release.yml` construit les 5 binaires (macOS arm64 et x64, Linux x64 et arm64, Windows x64), écrit `SHA256SUMS` et crée la release.

## Architecture

Le code a trois parties : le serveur (`src/`), l'interface (`web/src/`) et le contrat entre les deux (`shared/`). Les tests ont la même structure dans `test/` et `web/test/`.

### Serveur (`src/`)

| Dossier | Contenu |
| --- | --- |
| `main.ts` | Point d'entrée. Il lit les arguments et lance la bonne commande. |
| `app/` | Racine de composition. `start.ts` crée les vrais clients et les relie. `deps.ts` donne les vrais accès au disque et aux processus. |
| `cli/` | Commandes qui s'exécutent une fois : arguments, installation, service, mise à jour du binaire. |
| `config/` | Variables d'environnement, chemins, version et fichiers du dashboard (clé Linear, jeton, PID). |
| `server/` | HTTP, SSE et site statique. Le routeur lit et vérifie les requêtes (`validate.ts`), puis appelle le domaine. |
| `domain/` | Règles et état : synchronisation avec T3, classement des fils, détail d'un fil, actions, jeton, board Linear, réglages, mises à jour, automatisations. |
| `integrations/` | Tous les appels vers un autre système : T3 Code, Linear, GitHub et les fichiers t3-agent. Chaque réponse passe par un schéma. |

### Interface (`web/src/`)

| Dossier | Contenu |
| --- | --- |
| `api/` | Client de l'API locale, flux d'évènements (`useDashboard`) et `ApiContext`. `useApi()` donne la vraie API, sauf si un `ApiProvider` en donne une autre. |
| `lib/` | Fonctions et composants partagés par plusieurs écrans. |
| `features/` | Un dossier par écran : `agents`, `desk`, `conversation`, `board`, `settings`, `setup`, `update`, `new-thread`. |
| `ui/` | Composants de base. Voir `web/src/ui/README.md`. |

### Contrat (`shared/`)

`shared/api.ts` réexporte les types de chaque thème : `threads`, `connection`, `events`, `requests`, `linear`, `settings`, `automations`. `limits.ts` contient les limites communes (images, modes d'exécution). `status.ts` contient le modèle de statut des fils. `events.ts` donne la liste des types d'évènements : l'interface s'abonne à cette liste.

### Règles d'import

Le test `test/architecture.test.ts` lit les imports et bloque une dépendance interdite.

- `shared/` n'importe rien.
- `config/` importe seulement `shared/`.
- Une intégration importe `config/`, `shared/`, `integrations/contract.ts`, `integrations/errors.ts` et `integrations/drift.ts` (rapport des contrats). Elle n'importe pas le domaine, le serveur ni une autre intégration.
- `domain/` importe `shared/`, `config/` et `integrations/`. Il n'importe pas `server/`, `app/` ni `cli/`.
- `server/` importe `shared/`, `domain/`, `config/` et `integrations/errors.ts`. Il passe par le domaine pour parler à T3 ou à Linear.
- `cli/` importe `config/` et `integrations/github/`.
- `app/` importe tout.
- `ui/` n'importe que `ui/`. Seule exception : la logique de menu de `lib/dropdown.ts`.
- `lib/` et `api/` n'importent pas `features/`.
- Un écran importe `lib/`, `api/`, `ui/` et `shared/`. Il n'importe un autre écran que par un lien de la liste du test (par exemple `desk` vers `conversation`).
- L'interface n'importe jamais `src/`.

Un deuxième test (`test/integrations/boundary.test.ts`) bloque `fetch`, `WebSocket` et le lancement de processus hors de `integrations/`. Seuls `app/start.ts` et `app/deps.ts` ont une exception.

### Erreurs

- Une intégration lance une `IntegrationError` : système, type (`unreachable`, `refused`, `protocol`, `not-authenticated`) et message.
- Le domaine lance une `DomainError` : `invalid`, `not-found` ou `conflict`.
- `toHttp(error)` dans `server/httpError.ts` donne le code HTTP : 400, 404 ou 409 pour le domaine, 400 pour une clé Linear refusée, 502 pour les autres erreurs d'intégration. Une autre erreur donne 500 et va dans le log.
- Un message d'erreur ne contient jamais une clé, un jeton ni le corps d'une réponse.

## Automatisations

La colonne de droite de l'onglet Agents lit les cerveaux t3-agent, sans jamais écrire. Pour chaque `*.json` du dossier `T3_DASHBOARD_AGENT_CONFIG_DIR`, le serveur lit seulement `workspace` et `projectId`. Il ne lit, ne renvoie et ne logge jamais le `token`.

- Routines : un job avec `schedule.cron`. La liste montre le libellé, la prochaine exécution et l'état du fil de la routine. Ce fil n'apparaît pas dans la grille des agents.
- Rappels : un job avec `schedule.at`. Un rappel passé disparaît.
- Un fichier de job illisible est ignoré et compté dans `problems`.
- `GET /api/automations` relit les fichiers à chaque appel.

## Sécurité

- Le jeton reste sur le serveur. Le navigateur ne le voit jamais.
- Le serveur écoute seulement sur `127.0.0.1`.
- Chaque requête vérifie les en-têtes `Host` et `Origin` (`127.0.0.1` ou `localhost`).
- Le serveur n'envoie aucun en-tête CORS.
- L'interface ne propose pas « Toujours accepter » : seuls `accept`, `acceptForSession` et `decline` passent.

## Vérifications

```sh
bun run check   # types et tests, serveur et interface
bun run smoke   # construit le binaire et vérifie qu'il sert l'interface
bun run contracts   # lit T3 Code, Linear, GitHub et t3-agent, sans rien écrire
```

Aucun test ne contacte T3 Code. `bun run contracts` contacte les vrais systèmes en lecture seule : voir `docs/contracts.md`.

## Vérifications manuelles

Ces actions écrivent dans le vrai T3 Code. Faites-les une fois après une mise à jour.

1. Créer un thread.
2. Envoyer un message sur un thread inactif, en file, puis en orientation (`steer`).
3. Interrompre un run.
4. Répondre à une approbation avec chacun des 3 boutons.
5. Répondre à une question, puis cliquer sur « Ignorer ».
6. Vérifier qu'un agent qui démarre ou finit change de carte dans l'onglet Agents sans recharger la page.
