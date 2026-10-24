# t3-dashboard

Dashboard web local pour gérer les threads et les agents de T3 Code. Il remplace la vue en fil par un tableau par statut (À traiter, En cours, Terminé, Inactif), des filtres et des graphiques. Il permet aussi d'envoyer un message, d'interrompre un run, de répondre aux demandes d'approbation et de saisie, d'épingler et d'archiver.

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
| `T3_SERVER_RUNTIME` | `~/.t3/userdata/server-runtime.json` | Fichier JSON avec le champ `origin`, relu à chaque connexion à T3. Repli : `http://127.0.0.1:3773`. |

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
