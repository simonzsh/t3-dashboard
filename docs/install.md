# Installation et configuration

[Retour au README](../README.md)

## Installation

Prérequis : T3 Code installé sur le même ordinateur.

macOS et Linux :

```sh
curl -fsSL https://raw.githubusercontent.com/simonzsh/t3-dashboard/main/install.sh | sh
```

Windows (PowerShell) :

```powershell
irm https://raw.githubusercontent.com/simonzsh/t3-dashboard/main/install.ps1 | iex
```

Le script fait ces étapes :

1. Il télécharge le binaire de votre système depuis la dernière release GitHub.
2. Il vérifie sa somme SHA-256 avec le fichier `SHA256SUMS` de la release.
3. Il place le binaire dans `~/.local/bin` (Windows : `%LOCALAPPDATA%\Programs\t3-dashboard`).
4. Il lance `t3-dashboard install`. Cette commande enregistre le service, le démarre et ouvre `http://127.0.0.1:4300`.

- Sous macOS et Linux, le script avertit si le dossier n'est pas dans le `PATH`.
- Sous Windows, le script ajoute le dossier au `PATH` de l'utilisateur. Ouvrez un nouveau terminal pour utiliser `t3-dashboard`.
- Sous Windows ARM64, le binaire x64 tourne en émulation.

Options du script :

| Variable | Rôle |
| --- | --- |
| `T3_DASHBOARD_VERSION=1.2.3` | Installe cette version et pas la dernière. |
| `T3_DASHBOARD_INSTALL_DIR` | Change le dossier du binaire (macOS et Linux seulement). |
| `T3_DASHBOARD_NO_SERVICE=1` | Installe le binaire sans service. |
| `T3_DASHBOARD_REPO` | Change le repo GitHub des releases. |

## Service

| Système | Mécanisme |
| --- | --- |
| macOS | LaunchAgent `~/Library/LaunchAgents/t3-dashboard.plist` |
| Linux | Unité `systemd --user` : `~/.config/systemd/user/t3-dashboard.service` |
| Windows | Tâche planifiée « T3 Dashboard » à l'ouverture de session |

- Le service redémarre seul après une panne.
- `install` copie dans le service ces variables, si elles sont définies au moment de l'installation : `T3_DASHBOARD_TOKEN_FILE`, `T3_DASHBOARD_CONFIG_DIR`, `T3_DASHBOARD_LINEAR_FILE`, `T3_DASHBOARD_AGENT_CONFIG_DIR`, `T3_DASHBOARD_T3_BIN`, `T3_DASHBOARD_ALLOWED_HOSTS`, `T3_SERVER_RUNTIME` et `T3CODE_HOME`. Pour changer une valeur, définissez la variable et relancez `install`.
- `install` et `update` attendent 15 s au plus que le nouveau binaire réponde sur le port.
- Si un autre programme ou un ancien dashboard tient le port, la commande s'arrête avec cette erreur : « Port 4300 is used by another program or an older dashboard. » Arrêtez ce programme, ou installez avec `--port <n>`.
- Sous Linux, `install` demande `systemctl`. Sans `systemctl`, utilisez `t3-dashboard start`.
- Sous Linux, exécutez `loginctl enable-linger $USER` pour démarrer le service au boot, sans ouvrir de session.
- Sous Windows, la tâche n'a pas besoin de droits d'administrateur. Si Windows refuse la tâche, l'installeur utilise la clé `Run` de l'utilisateur.
- Sous Windows, les droits de fichier (mode 600) ne s'appliquent pas. Le dossier de config reste dans votre profil.

## Commandes

```sh
t3-dashboard install [--port 4300] [--no-open]       # enregistre et démarre le service
t3-dashboard uninstall                               # arrête et retire le service, garde la config
t3-dashboard update [--check]                        # installe la dernière release
t3-dashboard start [--port 4300] [--log <fichier>]   # lance au premier plan, sans service
t3-dashboard --version
t3-dashboard --help
```

Sans commande, `t3-dashboard` fait `start`. `install` et `update` refusent de tourner hors du binaire compilé.

## Premier lancement

1. Le dashboard cherche `t3`. Il crée son propre jeton d'accès avec `t3 auth session issue`. Il garde ce jeton dans `~/.config/t3-dashboard/auth.json` (mode 600). Vous ne faites rien.
2. Si T3 Code est arrêté ou absent, un écran plein explique quoi faire. Lancez ou installez T3 Code, puis cliquez sur « Retry ». Le dashboard s'affiche sans recharger la page.
3. Si la création du jeton échoue, l'écran donne la commande exacte. Exécutez-la, puis collez le jeton dans le champ.
4. Dans l'onglet Board, une carte explique comment connecter Linear.

## Linear

Linear est facultatif. Il sert seulement au Board. Tout se règle depuis le dashboard.

1. Dans Linear, ouvrez Settings, Account, Security & access. Cliquez sur « New API key » dans « Personal API keys ». Lien direct : <https://linear.app/settings/account/security>.
2. Dans l'onglet Board, collez la clé et cliquez sur « Connect ». Le serveur vérifie la clé auprès de Linear avant de l'enregistrer.
3. Dans Settings, la section Linear montre l'état de la clé. Elle permet de changer ou de retirer la clé.

La clé est le seul réglage. Le Board affiche les tickets assignés de toutes les équipes de l'espace Linear. Si la clé couvre plusieurs entreprises, leurs tickets s'affichent ensemble.

Le serveur garde la clé dans `~/.config/t3-dashboard/linear.json` (mode 600). Il ne renvoie jamais la clé au navigateur, seulement ses 4 derniers caractères. Il garde les tickets 60 s en mémoire. Le bouton « Refresh » du Board relit les tickets tout de suite.

Format du fichier :

```json
{ "apiKey": "lin_api_..." }
```

- Un ancien fichier peut contenir `teams` et `unlisted`. Le serveur les ignore et les supprime à la prochaine écriture.
- Le serveur lit encore l'ancien format `{ "workspaces": [...] }`. Il prend la première clé non vide et ignore les autres. Le premier enregistrement depuis Settings écrit le format simple.

## Mises à jour

### Depuis le dashboard

Le dashboard cherche une nouvelle release GitHub au démarrage, puis toutes les heures. Une erreur réseau ou l'absence de release n'affiche rien.

1. Quand une version plus récente existe, le bouton « Update vX.Y.Z » apparaît dans l'en-tête.
2. Cliquez sur ce bouton, puis confirmez.
3. Le dashboard fait la même mise à jour que `t3-dashboard update`, puis redémarre.
4. La page attend le nouveau dashboard et se recharge seule. Si la mise à jour échoue, la page affiche l'erreur.

Dans Settings, la section « About » montre la version installée. Le bouton « Check for updates » cherche une nouvelle version tout de suite. Si elle existe, le bouton « Update to vX.Y.Z » apparaît.

- Aucune mise à jour ne se fait sans clic.
- Un dashboard lancé avec `start` se relance seul avec les mêmes arguments.
- Une version `dev` ne cherche pas de mise à jour seule. Une version `dev`, ou un dashboard lancé hors du binaire compilé, ne se met pas à jour : la page l'explique.

### Depuis un terminal

```sh
t3-dashboard update
```

La commande télécharge la dernière release GitHub et vérifie la somme SHA-256. Elle remplace le binaire et redémarre le service. Avec `--check`, elle indique seulement si une version plus récente existe.

## Logs

| Système | Emplacement |
| --- | --- |
| Linux | `journalctl --user -u t3-dashboard -f` |
| macOS | `~/Library/Logs/t3-dashboard/dashboard.log` |
| Windows | `%LOCALAPPDATA%\t3-dashboard\dashboard.log` |

Les logs ne contiennent jamais de jeton ni de clé API. Le fichier `dashboard.pid` se trouve dans le même dossier que le log. Sous Linux, ce dossier est `~/.local/state/t3-dashboard`.

## Désinstallation

1. Exécutez `t3-dashboard uninstall`. La commande arrête et retire le service.
2. Supprimez le binaire : `rm ~/.local/bin/t3-dashboard`. Sous Windows, supprimez le dossier `%LOCALAPPDATA%\Programs\t3-dashboard`.
3. Si vous le voulez, supprimez la config : `rm -r ~/.config/t3-dashboard`. Sous Windows, ce dossier est `%USERPROFILE%\.config\t3-dashboard`.

## Accès à distance

Le serveur écoute seulement sur `127.0.0.1`. Par défaut, il refuse les en-têtes `Host` et `Origin` autres que `127.0.0.1` et `localhost`.

Pour ouvrir le dashboard depuis un autre appareil, utilisez un proxy sur un réseau privé, par exemple `tailscale serve` :

1. Exposez le port avec `tailscale serve`.
2. Mettez le nom de la machine dans `T3_DASHBOARD_ALLOWED_HOSTS`, par exemple `box.tailnet.ts.net`.
3. Relancez `t3-dashboard install` : le service reçoit la variable.

Le dashboard n'a pas d'authentification. Toute personne qui atteint l'adresse peut piloter vos agents. N'ouvrez l'accès que sur un réseau privé.

## Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `4300` | Port local. L'écoute reste sur `127.0.0.1`. `--port` l'emporte. Une valeur vide, invalide ou `0` donne `4300`. |
| `T3_DASHBOARD_CONFIG_DIR` | `~/.config/t3-dashboard` | Dossier de `auth.json` et de `linear.json`. |
| `T3_DASHBOARD_TOKEN_FILE` | aucun | Fichier JSON avec le champ `token`. Sans lui, le dashboard garde son propre jeton. Avec lui, l'écran de réglage refuse un jeton collé : mettez le jeton dans ce fichier. |
| `T3_DASHBOARD_ALLOWED_HOSTS` | aucun | Noms d'hôte séparés par des virgules, sans port. Ils s'ajoutent à `127.0.0.1` et `localhost` pour les en-têtes `Host` et `Origin`. Voir [Accès à distance](#accès-à-distance). |
| `T3_DASHBOARD_T3_BIN` | recherche auto | Chemin absolu de `t3`. |
| `T3_DASHBOARD_LINEAR_FILE` | `<config>/linear.json` | Fichier de la config Linear. |
| `T3_DASHBOARD_AGENT_CONFIG_DIR` | `~/.config/t3-agent` | Dossier des configs t3-agent, un `*.json` par assistant. |
| `T3CODE_HOME` | `~/.t3` | Dossier de base de T3 Code. Le dashboard le passe aussi à `t3 auth session issue`. |
| `T3_SERVER_RUNTIME` | `<T3CODE_HOME>/userdata/server-runtime.json` | Fichier JSON avec le champ `origin`, relu à chaque connexion à T3. Repli : `http://127.0.0.1:3773`. |
| `T3_DASHBOARD_REPO` | `simonzsh/t3-dashboard` | Repo GitHub des releases, pour `update`, la vérification horaire et les scripts d'installation. |
