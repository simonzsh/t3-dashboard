# Utilisation

[Retour au README](../README.md)

Le dashboard a trois onglets : Agents, Desk et Board. Le bouton New Agent et les réglages (Settings) sont dans l'en-tête.

## Agents

L'onglet Agents montre une carte par session T3 Code.

- Les cartes sont groupées par projet T3. Chaque groupe montre l'icône et le nom du projet.
- Dans un groupe, l'ordre est : en attente, au travail, fini, inactif. Les agents qui attendent une réponse passent donc en haut.
- Les groupes qui ont un agent en attente passent avant les autres.
- Une carte montre le fournisseur (Claude ou Codex), le titre, le dernier message, l'état et l'heure de la dernière activité. Si l'agent attend une approbation ou une réponse, la carte le dit.
- Un agent terminé (« settled » dans T3 Code) va dans une section repliée sous son groupe. Il disparaît après 3 jours sans activité.
- Les sessions archivées ou supprimées, les sous-agents et les fils des routines t3-agent n'apparaissent pas.
- Un clic sur une carte ouvre la conversation sur le Desk. Maj + clic l'ajoute au Desk sans changer d'onglet.
- Le bouton « Add to Desk » ajoute la carte au Desk. Un deuxième clic la retire.
- Le lien « Open in T3 Code » ouvre la session dans T3 Code.

Les cartes changent d'état en direct, sans recharger la page.

## Desk

Le Desk montre plusieurs conversations côte à côte, dans une grille.

- Six fenêtres restent visibles au plus. Quand vous ouvrez une septième fenêtre, la plus ancienne se réduit dans le dock.
- Un clic dans le dock rouvre la fenêtre.
- Tirez les séparateurs pour changer la taille des colonnes et des lignes. Le navigateur garde ces tailles pour chaque nombre de fenêtres.
- Chaque fenêtre a trois boutons : plein écran, réduire, fermer.
- Le navigateur garde les fenêtres ouvertes d'une visite à l'autre.
- Dans Settings, choisissez un fond pour le Desk : un dégradé ou votre propre image.

### Conversation

Chaque fenêtre du Desk contient une conversation.

- Écrivez un message et envoyez-le avec `Entrée`. Pendant un run, le message oriente le run en cours (« Steer »).
- Joignez des images : PNG, JPEG, GIF ou WebP. La limite est de 10 images, 10 Mo par image et 18 Mo au total.
- Changez le modèle, l'effort de raisonnement et le mode d'accès (« Supervised », « Auto-accept edits », « Auto », « Full access »).
- Arrêtez un run avec le bouton « Stop ».
- Répondez à une approbation : « Accept », « Accept for session » ou « Decline ». Le dashboard ne propose pas « Toujours accepter ».
- Répondez à une question de l'agent, ou cliquez sur « Dismiss ».
- Suivez les étapes du run : réflexion, commandes, outils, fichiers et sous-agents.
- Voyez les images et les vidéos que l'agent cite dans ses messages.
- Voyez les pages de l'outil `html_render` de T3 Code. Le dashboard les affiche dans un cadre isolé (sandbox), avec les couleurs du thème.

## New Agent

Le bouton New Agent (touche `N`) lance un nouvel agent.

1. Choisissez un projet T3, ou laissez « No project ». Sans projet, la session va dans le projet « No project » de T3 Code.
2. Écrivez la tâche. La première ligne devient le titre de la session.
3. Si vous le voulez, changez le modèle, le mode d'accès ou joignez des images.
4. Envoyez. La conversation s'ouvre sur le Desk.

- Le modèle proposé est le modèle par défaut du projet. Sinon, c'est le modèle par défaut de T3 Code.
- Les modèles favoris de T3 Code sont en haut de la liste.
- Le navigateur retient le dernier projet choisi.

## Board

L'onglet Board montre les tickets Linear qui vous sont assignés. Il demande une clé API Linear : voir [install.md](install.md#linear).

- Une colonne par statut Linear. Dans une colonne, les tickets sont groupés par projet Linear. Les tickets sans projet vont dans « No project ».
- Dans un groupe, les tickets sont triés par priorité, puis par date de mise à jour.
- Un clic sur un ticket l'ouvre dans Linear.
- Le bouton « Refresh » relit les tickets tout de suite.

### Confier un ticket à un agent

1. Cliquez sur le bouton « Assign to an agent » du ticket. La fenêtre New Agent s'ouvre avec le ticket.
2. Choisissez le projet T3. Le navigateur retient le dernier projet choisi pour chaque équipe Linear et le présélectionne.
3. Choisissez le modèle et le mode d'accès.
4. Si vous le voulez, ajoutez des instructions ou des images.
5. Envoyez. La session porte le numéro et le titre du ticket. Elle s'ajoute au Desk, et le Board reste affiché.
6. Cliquez sur « View on Desk » pour voir la conversation.

Le souvenir du projet reste dans le `localStorage` du navigateur, pas sur le serveur.

## Automatisations

La colonne de droite de l'onglet Agents liste les routines et les rappels des assistants t3-agent. Elle apparaît seulement si un assistant existe dans `~/.config/t3-agent`. Elle ne fait que lire.

- Une routine est un job avec `schedule.cron`. La liste montre le libellé, la prochaine exécution et l'état du dernier run.
- Le fil d'une routine n'apparaît pas dans la grille des agents.
- Un rappel est un job avec `schedule.at`. Un rappel passé disparaît.
- Un fichier de job illisible est ignoré et compté comme un problème.

Pour chaque `*.json` du dossier, le serveur lit seulement `workspace` et `projectId`. Il ne lit, ne renvoie et ne logge jamais le `token`.

## Settings

Ouvrez Settings avec le bouton de l'en-tête ou la touche `,`.

- Appearance : thème « System », « Light » ou « Dark ».
- Desk : fond du Desk.
- Linear : état de la clé, changement ou retrait de la clé.
- About : version installée, recherche et installation d'une mise à jour. Voir [install.md](install.md#mises-à-jour).

## Raccourcis clavier

Les raccourcis ne marchent pas pendant la saisie dans un champ ni quand une fenêtre de dialogue est ouverte.

| Touche | Action |
| --- | --- |
| `1`, `2`, `3` | Ouvre Agents, Desk ou Board. |
| `N` | Ouvre New Agent. |
| `,` | Ouvre Settings. |
| `X` | Desk : ferme la fenêtre active. |
| `F` | Desk : met la fenêtre active en plein écran, ou l'en sort. |
| `M` | Desk : réduit la fenêtre active. |
| `Échap` | Desk : sort du plein écran. |
| `Alt` + `1` à `6` | Desk : active la fenêtre 1 à 6 et place le curseur dans son champ de message. |

Une infobulle donne le nom de chaque bouton et son raccourci. Les animations s'arrêtent si le système demande moins de mouvement (`prefers-reduced-motion`).
