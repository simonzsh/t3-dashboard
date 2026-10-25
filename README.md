# t3-dashboard

Dashboard web local pour gérer les threads et les agents de T3 Code. Il tourne en arrière-plan et s'ouvre dans le navigateur.

- **Agents** : une carte par session T3 Code, regroupées par projet. Une colonne « Automatisations » (lecture seule) liste les routines et les rappels des cerveaux t3-agent. Elle n'apparaît que si un cerveau existe. Les agents qui attendent l'utilisateur passent en haut. Un clic ouvre la conversation : envoi de message, interruption, réponse aux approbations et aux questions, épinglage, archivage.
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

Le script télécharge le binaire, vérifie sa somme SHA-256 et le place dans `~/.local/bin` (Windows : `%LOCALAPPDATA%\Programs\t3-dashboard`). Il lance ensuite `t3-dashboard install`. Cette commande enregistre le service, le démarre et ouvre `http://127.0.0.1:4310`.

Tant que le repo GitHub est privé, ces adresses répondent 404. L'installation en une commande marche après le passage du repo en public.

Options du script : `T3_DASHBOARD_VERSION=1.2.3` fixe la version, `T3_DASHBOARD_INSTALL_DIR` change le dossier du binaire (macOS et Linux), `T3_DASHBOARD_NO_SERVICE=1` installe le binaire sans service.

### Service

| | Mécanisme |
|---|---|
| macOS | LaunchAgent `~/Library/LaunchAgents/t3-dashboard.plist` |
| Linux | unité `systemd --user` : `~/.config/systemd/user/t3-dashboard.service` |
| Windows | tâche planifiée « T3 Dashboard » à l'ouverture de session |

- Le service redémarre seul après une panne.
- Sous Linux, exécutez `loginctl enable-linger $USER` pour démarrer le service au boot, sans ouvrir de session.
- Sous Windows, la tâche n'a pas besoin de droits d'administrateur. Si Windows la refuse, l'installeur utilise la clé `Run` de l'utilisateur.
- Sous Windows, les droits de fichier (mode 600) ne s'appliquent pas. Le dossier de config reste dans votre profil.

### Commandes

```sh
t3-dashboard install [--port 4310] [--no-open]   # enregistre et démarre le service
t3-dashboard uninstall                           # arrête et retire le service, garde la config
t3-dashboard update [--check]                    # installe la dernière release
t3-dashboard start [--port 4310] [--log <fichier>]   # lance au premier plan, sans service
t3-dashboard --version
```

### Mise à jour

```sh
t3-dashboard update
```

La commande télécharge la dernière release GitHub, vérifie la somme SHA-256, remplace le binaire et redémarre le service. Avec `--check`, elle indique seulement si une version plus récente existe.

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
3. Dans Settings, la section Linear permet de changer ou de retirer la clé. Elle liste aussi les équipes : pour chacune, choisissez un projet T3, « Ask when assigning » ou « Hidden ».

Règles des équipes :

- « Hidden » : les tickets de l'équipe ne s'affichent pas et on ne peut pas les assigner.
- « Ask when assigning » : le menu d'assignation demande le projet T3.
- Une équipe absente de la liste suit le réglage « Teams not listed » (affichées ou cachées).
- Quand vous choisissez un projet T3 à l'assignation, le dashboard retient ce choix pour l'équipe.

Le serveur garde la clé dans `~/.config/t3-dashboard/linear.json` (mode 600). Il ne la renvoie jamais au navigateur, seulement les 4 derniers caractères au plus. Il garde les tickets 60 s ; `GET /api/board?refresh=1` force la relecture.

Format du fichier :

```json
{ "apiKey": "lin_api_...", "teams": { "ENG": "Project A", "OPS": null, "DES": "" }, "unlisted": "show" }
```

- `teams` : la clé de l'équipe Linear avec le titre du projet T3, `""` (demander) ou `null` (cachée).
- `unlisted` : `"show"` ou `"hide"`. Sans ce champ, la valeur est `"hide"` quand `teams` existe, sinon `"show"`.
- L'ancien format `{ "workspaces": [...] }` marche toujours. Le premier enregistrement depuis Settings le convertit en un seul workspace. Settings prévient avant.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `4310` | Port local. L'hôte est toujours `127.0.0.1`. `--port` l'emporte. |
| `T3_DASHBOARD_CONFIG_DIR` | `~/.config/t3-dashboard` | Dossier de `auth.json` et de `linear.json`. |
| `T3_DASHBOARD_TOKEN_FILE` | aucun | Fichier JSON avec le champ `token`. Sans lui, le dashboard garde son propre jeton. |
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
```

Aucun test ne contacte T3 Code.

## Vérifications manuelles

Ces actions écrivent dans le vrai T3 Code. Faites-les une fois après une mise à jour.

1. Créer un thread.
2. Envoyer un message sur un thread inactif, en file, puis en orientation (`steer`).
3. Interrompre un run.
4. Répondre à une approbation avec chacun des 3 boutons.
5. Répondre à une question, puis cliquer sur « Ignorer ».
6. Épingler, désépingler, archiver.
7. Vérifier qu'un agent qui démarre ou finit change de carte dans l'onglet Agents sans recharger la page.
