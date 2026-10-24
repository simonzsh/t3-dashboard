# t3-dashboard

Dashboard web local pour gérer les threads et les agents de T3 Code. Il remplace la vue en fil par deux onglets.

- **Agents** : une carte par session T3 Code, regroupées par projet. Les agents qui attendent l'utilisateur passent en haut. Un clic ouvre la conversation : envoi de message, interruption, réponse aux approbations et aux questions, épinglage, archivage.
- **Board** : les tickets Linear assignés à vous, groupés par projet Linear. Un clic ouvre le ticket dans Linear. Le bouton « assigner à un agent » crée une session T3 Code (Claude ou Codex) qui traite le ticket. Elle apparaît seule dans l'onglet Agents.

Le serveur Node (TypeScript, sans dépendance d'exécution) parle à T3 Code et expose une API locale. L'interface React se trouve dans `web/`.

## Installation

```sh
npm install && npm --prefix web install
```

Node 24 ou plus récent est nécessaire.

## Lancement

Production :

```sh
npm run build
npm start
```

Ouvrez `http://127.0.0.1:4310`.

Développement, dans deux terminaux :

```sh
npm run dev       # serveur avec rechargement
npm run dev:web   # Vite sur http://127.0.0.1:5173, proxy /api vers le serveur
```

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `4310` | Port local. L'hôte est toujours `127.0.0.1`. |
| `T3_DASHBOARD_TOKEN_FILE` | `~/.config/t3-agent/perso.json` | Fichier JSON avec le champ `token`. |
| `T3_DASHBOARD_LINEAR_FILE` | `~/.config/t3-dashboard/linear.json` | Fichier JSON des workspaces Linear (voir ci-dessous). |
| `T3_SERVER_RUNTIME` | `~/.t3/userdata/server-runtime.json` | Fichier JSON avec le champ `origin`, relu à chaque connexion à T3. Repli : `http://127.0.0.1:3773`. |

## Configuration de Linear

Le dashboard lit un fichier hors git, avec le mode 600 :

```json
{ "workspaces": [ { "name": "Workspace 1", "apiKey": "lin_api_...", "t3Project": "Project A" } ] }
```

- `name` : le nom affiché.
- `apiKey` : une clé API personnelle.
- `t3Project` : le titre ou l'id du projet T3 Code qui reçoit les sessions créées depuis ce workspace.

Pour créer une clé : dans Linear, ouvrez Settings, Account, Security & access, puis « Personal API keys » et « New API key ». Un fichier absent ou une clé vide ne bloque pas le serveur : l'onglet Board affiche « Clé API manquante ». Le serveur ne logge et ne renvoie jamais une clé.

Chaque workspace est lu séparément. Le serveur garde le résultat 60 s ; `GET /api/board?refresh=1` force la relecture.

## Sécurité

- Le jeton reste sur le serveur. Le navigateur ne le voit jamais.
- Le serveur écoute seulement sur `127.0.0.1`.
- Chaque requête vérifie les en-têtes `Host` et `Origin` (`127.0.0.1` ou `localhost`).
- Le serveur n'envoie aucun en-tête CORS.
- L'interface ne propose pas « Toujours accepter » : seuls `accept`, `acceptForSession` et `decline` passent.

## Vérifications

```sh
npm run typecheck && npm test   # serveur
npm run check                   # serveur et interface
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
7. Vérifier qu'un `thread.updated` déplace une carte d'une colonne à l'autre sans recharger la page.
