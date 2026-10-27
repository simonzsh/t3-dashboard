# Utilisation

[Retour au README](../README.md)

Le dashboard a trois onglets : Agents, Desk et Board. Le bouton New Agent et les réglages (Settings) sont dans l'en-tête.

## Agents

L'onglet Agents montre une carte par session T3 Code.

- Les cartes sont groupées par projet T3. Chaque groupe montre l'icône et le nom du projet.
- Dans un groupe, les agents épinglés dans T3 Code viennent en premier, avec une petite épingle. Ensuite, l'ordre est : en attente, au travail, fini, inactif.
- Les groupes suivent l'ordre alphabétique des projets. Cet ordre ne change jamais. Un point jaune près du nom signale un agent en attente dans le groupe.
- Une carte montre le fournisseur (Claude ou Codex), le titre, l'état et l'heure de la dernière activité. Si l'agent attend une approbation ou une réponse, la carte le dit.
- Un agent terminé (« settled » dans T3 Code) va dans une section repliée sous son groupe. Il disparaît après 3 jours sans activité.
- Les sessions archivées ou supprimées, les sous-agents et les fils des tâches planifiées (voir [Automatisations](#automatisations)) n'apparaissent pas.
- Un clic sur une carte ouvre la conversation sur le Desk. Maj + clic l'ajoute au Desk sans changer d'onglet.
- Le bouton « Add to Desk » ajoute la carte au Desk. Un deuxième clic la retire.
- Le lien « Open in T3 Code » ouvre la session dans T3 Code.
- Les boutons sont en bas à droite de la carte, après l'état et l'heure : T3 (icône seule), Settle, puis Add to Desk.
- Le bouton « Settle » (icône de boîte) range un agent terminé dans « Recently settled », comme T3 Code. Il n'existe pas pour un agent qui travaille ou qui attend.
- Les cartes de « Recently settled » sont grisées : on les distingue des autres d'un coup d'œil.
- Dans « Recently settled », le bouton « Unsettle » remet l'agent dans la liste.

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

La colonne de droite de l'onglet Agents liste les tâches planifiées de T3 Code. Elle apparaît quand T3 Code est connecté. Elle se met à jour toutes les 30 s tant que l'onglet est ouvert.

- Une routine tourne à chaque passage. La ligne montre le projet, la cadence, le prochain passage et l'état du dernier passage. Une tâche en pause affiche « paused ».
- Un rappel est une tâche dont le titre commence par « Reminder: » ou « Rappel : ». La ligne montre la date du rappel. Le préfixe n'est pas affiché.
- Un clic sur une ligne ouvre le fil de la tâche.
- Si T3 Code est trop ancien pour lister les tâches, la colonne montre l'erreur. La grille des agents marche toujours.

### Créer un rappel ou une routine

1. Écrivez la demande dans le champ « New reminder or routine… » en haut de la colonne. Exemple : « Chaque jour ouvré à 9 h, résume mes tickets Linear ».
2. Choisissez un projet, ou laissez « No project ». Le dashboard garde ce choix pour la fois suivante.
3. Appuyez sur Entrée, ou cliquez sur « Add ».

Le dashboard crée un fil avec le modèle par défaut du projet. Ce fil demande à l'agent de créer la tâche avec l'outil `schedule_task` de T3 Code. La ligne apparaît dans la colonne après la création. Le bouton « Open » ouvre le fil.

- Une demande ponctuelle devient un rappel. L'agent met le préfixe « Reminder: » au titre. À la fin, il supprime la tâche.
- Une demande répétée devient une routine.
- Le fil créé par le champ reste dans la grille tant que l'agent prépare la tâche. Quand la tâche existe, le fil sort de la grille et s'ouvre depuis la colonne. Quand un rappel a passé et que sa tâche est supprimée, le fil revient dans la grille avec le résultat.
- Le dashboard garde la liste de ces fils dans `~/.config/t3-dashboard/automation-threads.json`.

### Depuis une conversation

Vous pouvez aussi demander une tâche dans une conversation normale. L'agent la lie à cette conversation. Elle reste dans la grille. Pour un rappel unique, écrivez : « Crée un rappel : le titre commence par "Reminder: ", et supprime la tâche après le passage ».

### Fils des tâches sans conversation liée

Une tâche sans fil lié crée un nouveau fil à chaque passage. Le dashboard cache ces fils de la grille. Il les reconnaît par le projet, le titre, l'origine et la date de création de la tâche. Le fil du dernier passage s'ouvre depuis la ligne de la tâche.

### Limites de T3 Code

- L'intervalle minimum est de 1 minute.
- Une heure fixe suit l'heure locale du serveur T3 Code. T3 Code n'a pas de fuseau horaire par tâche.
- Si l'agent ne supprime pas la tâche d'un rappel, le rappel se répète.

## Settings

Ouvrez Settings avec le bouton de l'en-tête ou la touche `,`. Une barre latérale à gauche liste les onglets ; un seul onglet est visible à la fois.

- Appearance : thème « System », « Light » ou « Dark », et fond du Desk.
- Connections : état de la clé Linear, changement ou retrait de la clé.
- App : comment installer le dashboard comme application (Dock, Launchpad, menu Démarrer, écran d'accueil). Les étapes suivent le navigateur et l'appareil : Safari, Chrome, Edge, iPhone et iPad, Android. Dia et Firefox n'installent pas d'app web.
- Updates : version installée, recherche et installation d'une mise à jour. Voir [install.md](install.md#mises-à-jour).

## Raccourcis clavier

Les raccourcis ne marchent pas pendant la saisie dans un champ ni quand une fenêtre de dialogue est ouverte. `Ctrl` + `K` fait exception : il marche aussi pendant la saisie. Il ne marche pas quand une autre fenêtre de dialogue est ouverte.

| Touche | Action |
| --- | --- |
| `1`, `2`, `3` | Ouvre Agents, Desk ou Board. |
| `Ctrl` + `K` ou `⌘` + `K` | Ouvre ou ferme le switcher « Jump to » : il cherche une conversation par titre, projet ou message. Sans texte, il propose les agents qui attendent une réponse, puis vos conversations récentes. `↑` `↓` choisissent, `Entrée` ouvre dans le Desk. |
| `N` | Ouvre New Agent. |
| `,` | Ouvre Settings. |
| `X` | Desk : ferme la fenêtre active. |
| `F` | Desk : met la fenêtre active en plein écran, ou l'en sort. |
| `M` | Desk : réduit la fenêtre active. |
| `Échap` | Desk : sort du plein écran. |
| `Alt` + `1` à `6` | Desk : active la fenêtre 1 à 6 et place le curseur dans son champ de message. |

Une infobulle donne le nom de chaque bouton et son raccourci. Les animations s'arrêtent si le système demande moins de mouvement (`prefers-reduced-motion`).
