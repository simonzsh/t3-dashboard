# t3-dashboard

t3-dashboard est un tableau de bord web au-dessus de T3 Code. Il montre tous vos agents Claude et Codex sur un seul écran. Vous suivez leur travail, vous leur répondez et vous lancez de nouveaux agents. Le Board affiche vos tickets Linear : un clic confie un ticket à un agent. Le dashboard tourne en arrière-plan sur votre ordinateur et s'ouvre dans le navigateur.

## Captures d'écran

| Agents | Desk |
| --- | --- |
| ![Agents](docs/screenshots/agents.png) | ![Desk](docs/screenshots/desk.png) |

| Board | New Agent |
| --- | --- |
| ![Board](docs/screenshots/board.png) | ![New Agent](docs/screenshots/new-agent.png) |

Les captures viennent du mode démo : les projets, les agents et les conversations sont inventés.

## Ce que vous pouvez faire

**Agents**

- Voir une carte par session T3 Code, groupée par projet, avec l'icône du projet.
- Voir en premier les agents qui attendent une réponse, puis ceux qui travaillent.
- Ouvrir une conversation sur le Desk d'un clic.

**Desk**

- Suivre plusieurs conversations côte à côte. Six fenêtres restent visibles. À la septième, la plus ancienne se réduit dans le dock.
- Envoyer un message, joindre des images, changer de modèle, arrêter un run.
- Répondre aux approbations et aux questions des agents.
- Lire les images, les vidéos et les pages HTML que l'agent affiche.

**Board**

- Voir les tickets Linear qui vous sont assignés, par statut et par projet.
- Confier un ticket à un agent : la fenêtre New Agent s'ouvre avec le ticket.

**Automatisations**

- Voir les routines et les rappels des assistants t3-agent, en lecture seule.

Le bouton New Agent (touche `N`) lance un agent dans un projet T3, ou dans « No project ». Il propose le modèle par défaut et les favoris de T3 Code. Le détail de chaque écran est dans [docs/usage.md](docs/usage.md).

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

Le script télécharge le binaire et vérifie sa somme SHA-256. Il enregistre ensuite un service qui démarre à l'ouverture de session. Puis il ouvre `http://127.0.0.1:4300`.

### Premier lancement

1. Le dashboard crée seul son jeton d'accès à T3 Code. Vous ne faites rien.
2. Si T3 Code est arrêté, un écran l'explique. Lancez T3 Code, puis cliquez sur « Retry ».
3. Si le jeton ne peut pas être créé, l'écran donne une commande. Exécutez-la, puis collez le jeton.
4. Facultatif : dans l'onglet Board, collez une clé API Linear pour voir vos tickets.

Le détail est dans [docs/install.md](docs/install.md).

## Connexions

| Système | Obligatoire | Usage |
| --- | --- | --- |
| API locale de T3 Code | Oui | Lit les projets, les sessions et les conversations. Envoie les messages, les réponses et les nouveaux agents. |
| Clé API Linear | Non | Lit les tickets qui vous sont assignés, pour le Board. |
| Releases GitHub | Non | Cherche une nouvelle version et la télécharge quand vous cliquez. |
| Fichiers des assistants t3-agent | Non | Lit les routines et les rappels, sans jamais écrire. |

## Fonctionnement

- Le dashboard est un binaire unique. Il contient le serveur et l'interface.
- Le serveur écoute seulement sur `127.0.0.1`. Il n'a pas d'authentification.
- Le jeton T3 et la clé Linear restent sur le serveur. Le navigateur ne les voit jamais.
- Le serveur garde une connexion ouverte avec T3 Code. L'interface se met à jour en direct, sans recharger la page.

## Mise à jour

Le dashboard cherche une nouvelle version toutes les heures. Quand elle existe, cliquez sur le bouton « Update vX.Y.Z » de l'en-tête. Dans un terminal : `t3-dashboard update`.

## Désinstallation

Exécutez `t3-dashboard uninstall`, puis supprimez le binaire. La procédure complète est dans [docs/install.md](docs/install.md#désinstallation).

## Documentation

- [docs/install.md](docs/install.md) : installation, service, commandes, mises à jour, logs, Linear, variables d'environnement, accès à distance.
- [docs/usage.md](docs/usage.md) : écrans, actions et raccourcis clavier.
- [docs/development.md](docs/development.md) : développement avec Bun, mode démo, vérifications, architecture, sécurité.
- [docs/contracts.md](docs/contracts.md) : vérification des contrats avec T3 Code, Linear, GitHub et t3-agent.
