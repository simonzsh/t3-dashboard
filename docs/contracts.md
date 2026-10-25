# Vérification des contrats

`bun run contracts` vérifie que T3 Code, Linear, GitHub et t3-agent envoient et acceptent toujours les champs que le dashboard utilise. Le script lit seulement. Il n'envoie aucune commande, ne crée aucun jeton et ne change rien dans Linear.

## Ce que le script vérifie

| Système | Vérification |
| --- | --- |
| `t3` | `server-runtime.json` contient `origin` et `serverVersion`. |
| `t3` | `POST /api/auth/websocket-ticket` donne `{ ticket }`. Ce ticket a une durée courte, comme dans l'usage normal. |
| `t3` | `server.getConfig` passe le schéma `RawConfig`. Le protocole d'orchestration est `2`. Chaque mode d'exécution est connu. |
| `t3` | `orchestration.subscribeShell` : le script lit le flux jusqu'à `synchronized`, puis l'arrête. Chaque élément passe le schéma `ShellItem`. Chaque statut de fil est connu. |
| `t3` | `GET /api/orchestration/threads/{id}` pour 3 fils au plus. Chaque réponse passe le schéma `ProjectionResponse`. |
| `t3` | Les 4 tags RPC du dashboard existent dans le client web de T3. |
| `t3` | Les commandes d'écriture (voir plus bas). |
| `linear` | `{ viewer { id } }`, puis une page des tickets assignés, avec la requête du board. Seulement si une clé existe. |
| `github` | La dernière release a un `tag_name` au format de version. Son fichier `SHA256SUMS` contient une somme SHA-256 pour chacun des 5 binaires. Le script ne télécharge aucun binaire. |
| `t3-agent` | Chaque fichier `~/.config/t3-agent/*.json` contient `workspace`. Chaque `jobs/*.yaml` passe le schéma `Job`. Chaque entrée de `state/routine-threads.json` et de `state/runs.json` passe son schéma. |

Les schémas sont dans `src/integrations/*/schemas.ts`. Le script utilise les mêmes schémas que le dashboard.

### Commandes d'écriture de T3

Le script n'exécute jamais une commande d'écriture (`thread.create`, `message.dispatch`, `run.interrupt`, `runtime-request.respond`, réglages, pièces jointes). Il fait une comparaison statique :

1. Il lit la version de T3 dans `server-runtime.json`.
2. Il lit comme du texte les fichiers `~/.t3/runtime/versions/<version>/client/assets/*.js`. Il n'importe pas et n'exécute pas ce code.
3. Il trouve la structure de chaque commande par son littéral `type`. Il donne à chaque clé `required` ou `optional`, et la liste des valeurs acceptées s'il y en a une.
4. Il construit les commandes avec les vrais constructeurs de `src/integrations/t3/commands.ts`.
5. Il compare les deux résultats, puis compare les structures avec `contracts/t3-commands.snapshot.json`.

Les noms minifiés changent à chaque version de T3. Le script ne les utilise pas. S'il ne peut pas lire les structures, il donne « could not run » et pas « breaking ».

Le test `test/integrations/t3/contracts.test.ts` compare les commandes du dashboard à l'instantané sans T3. Il fait partie de `bun run check`.

## Lancer le script

1. Démarrez T3 Code.
2. Démarrez le dashboard une fois : il enregistre son jeton dans `~/.config/t3-dashboard/auth.json`.
3. Lancez `bun run contracts` à la racine du repo.

Le script lit sa configuration dans les fichiers existants du dashboard :

- Jeton T3 : `~/.config/t3-dashboard/auth.json`, ou le fichier de `T3_DASHBOARD_TOKEN_FILE`. Le script ne crée et ne renouvelle jamais un jeton.
- Clé Linear : `LINEAR_API_KEY`, sinon `~/.config/t3-dashboard/linear.json`. Sans clé, le script saute Linear.
- GitHub : aucune authentification.

## Lire le rapport

Exemple :

```
t3 (version 0.1.2): CHANGED, 8 checks
  - breaking: snapshot run.interrupt.runId: optional, now required
  - could not run: thread projection: unreachable
linear: SKIPPED, no Linear key is configured
github: OK, 2 checks
t3-agent: OK, 19 checks

Result: breaking change (exit 1)
```

- Une ligne par système : `OK`, `CHANGED`, `COULD NOT RUN` ou `SKIPPED`, puis le nombre de vérifications.
- `breaking` : un champ que le dashboard lit ou envoie a changé. La ligne donne le chemin du champ, le type attendu et le type reçu.
- `could not run` : une vérification n'a pas pu s'exécuter (T3 arrêté, jeton refusé, réseau absent, bundle illisible).
- Les fils, les cerveaux et les jobs ont un numéro (`brain[0] job[2]`), jamais un nom.

Le rapport ne contient jamais une valeur : pas de titre, pas de jeton, pas de clé, pas de chemin personnel. Il contient seulement des chemins de champs, des types et des valeurs d'énumération de T3. Vous pouvez le copier dans un ticket public.

Codes de sortie :

| Code | Sens |
| --- | --- |
| `0` | Aucun changement. Un système sauté ne change pas le code. |
| `1` | Au moins un changement `breaking`. |
| `2` | Aucun changement `breaking`, mais au moins une vérification n'a pas pu s'exécuter. |

## Après une mise à jour de T3

1. Lancez `bun run contracts`.
2. Si le rapport donne des lignes `snapshot`, lisez les notes de version de T3.
3. Corrigez le code si un champ envoyé ou lu a changé : `src/integrations/t3/schemas.ts`, `src/integrations/t3/commands.ts`.
4. Lancez `bun run contracts --update-snapshot`. Le script écrit `contracts/t3-commands.snapshot.json` seulement s'il a pu lire toutes les commandes.
5. Lisez le diff de l'instantané, puis ouvrez une PR avec ce diff.

## Routine quotidienne

Une routine t3-agent sur la devbox lance le script chaque jour. T3 écoute seulement sur `127.0.0.1`, donc GitHub Actions ne peut pas faire cette vérification. L'orchestrateur crée la routine. Elle n'est pas dans ce repo.

La routine fait ces étapes :

1. Elle crée un worktree détaché sur `origin/main` dans un dossier temporaire. Le checkout principal ne change pas.
2. Elle lance `bun install --frozen-lockfile`, puis `bun run contracts`.
3. Code `0` : elle supprime le worktree et archive son fil.
4. Code `2` : elle envoie une notification courte (par exemple « T3 arrêté : aucune vérification »). Elle n'ouvre pas de ticket.
5. Code `1` : elle cherche un ticket GitHub ouvert avec le titre `Contract drift: <système>`. S'il existe, elle met à jour ce ticket. Sinon, elle crée ce ticket. Il y a un seul ticket par système.
6. Le corps du ticket contient seulement le rapport du script. La routine n'ajoute aucune donnée brute.
7. Elle supprime le worktree.

La routine n'ouvre jamais de PR. Le propriétaire lit le ticket, puis demande une correction.
