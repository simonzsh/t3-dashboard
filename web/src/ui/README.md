# Composants de base

Ce dossier contient les composants de base du dashboard. Les écrans de `web/src/features/` les utilisent. Importez-les depuis `ui/index.ts`.

## Règles

- Hors de `ui/`, n'écrivez pas de `<button>`, `<input>`, `<textarea>` ou `<select>` bruts. Un test (`web/test/uiRules.test.ts`) bloque ces éléments. Les liens `<a>` restent permis.
- Dans une rangée de boutons, mettez Annuler à gauche et l'action principale à droite. Le `Dialog` applique cet ordre.
- La couleur d'accent marque l'action principale, le focus et la sélection. N'utilisez pas d'autre couleur pour ces rôles.
- Le style des composants vient de `styles.css`. Les jetons sont en haut du fichier : `--focus-ring`, `--radius-*`, `--control-sm` (28 px) et `--control-md` (32 px).
- N'utilisez pas l'attribut natif `title` pour une info-bulle : un test le bloque. Écrivez `tooltip` et `shortcut` (ou `data-tooltip`). Le nom accessible reste `aria-label`.
- Chaque élément qui peut avoir le focus reçoit l'anneau d'accent. Ne remettez pas `outline: none` sans un autre signe visible du focus.

## Composants

| Composant | Utilisation |
| --- | --- |
| `Button` | Bouton avec un texte. Variantes : `primary` (une seule par rangée), `secondary` (par défaut), `ghost`, `danger`, `link`. Tailles : `sm`, `md`. `kbd` montre un raccourci. `loading` désactive le bouton ; un texte remplace alors le libellé. |
| `IconButton` | Bouton avec une icône seule. `label` est obligatoire : il donne le nom accessible et l'info-bulle (`tooltip` la remplace). Mêmes variantes et tailles que `Button`. |
| `Pressable` | Surface cliquable avec son propre style : carte, ligne, onglet, pastille. Pas de variante, pas de hauteur fixe. Utilisez `Button` ou `IconButton` pour un bouton normal. |
| `TextInput`, `TextArea` | Champ de texte. Le remplissage automatique est désactivé. |
| `SecretInput` | Champ masqué pour une clé ou un jeton. C'est un champ texte, pas un champ mot de passe : les gestionnaires de mots de passe ne s'ouvrent pas. |
| `Choice` | Case à cocher ou bouton radio (`type="checkbox"` ou `type="radio"`). |
| `FileInput` | Champ de fichier caché. Un bouton l'ouvre avec `ref.current.click()`. |
| `Dialog` | Fenêtre modale : titre, croix en haut à droite, Échap et clic dehors pour fermer. `onCancel` et `primary` ajoutent la rangée d'actions. |
| `Badge` | Étiquette d'état : `waiting`, `running`, `done`, `error`, `neutral`. |
| `Dropdown` | Menu de choix. Utilisez-le à la place de `<select>`. Un champ de filtre apparaît pour les longues listes. |
| `Popover` | Panneau fixé à côté d'un élément. Échap et clic dehors le ferment. |
| `Segmented` | Choix unique entre quelques options visibles (par exemple le thème). |
| `Kbd` | Raccourci clavier. |
| `TooltipLayer` | Info-bulle du dashboard, montée une seule fois dans `App`. Elle s'affiche tout de suite au survol et au focus clavier d'un élément qui porte `data-tooltip` (et `data-shortcut` pour le raccourci, dans un cadre). Elle se ferme au départ du pointeur, au clic, au scroll et avec Échap. Elle n'existe pas sur écran tactile. `Button`, `IconButton` et `Pressable` posent ces attributs avec `tooltip` et `shortcut`. Sur un autre élément, écrivez `data-tooltip`. |
| `Loader` | Chargement : le logo animé, centré dans la zone. Utilisez-le à la place d'un texte « Loading… ». |
| `Icon` | Icône Lucide par son nom. |

## Animations

Les animations utilisent la Web Animations API (`element.animate`), sans librairie. Elles durent de 160 à 320 ms. Avec `prefers-reduced-motion: reduce`, aucune animation ne joue. Elles ne bloquent pas les clics et ne changent pas la mise en page.

| Outil | Utilisation |
| --- | --- |
| `fly(source, cible)` | Une copie légère de `source` (son cadre et sa première ligne) vole jusqu'à `cible` et rétrécit. La cible fait ensuite un petit rebond. Exemple : le bouton + d'une carte agent vers l'onglet Desk. |
| `useFlip(racine, clé, { item, origin })` | Anime les éléments `[item]` de `racine` à chaque changement de `clé` (technique FLIP). Un élément gardé glisse vers sa nouvelle place. Un nouvel élément apparaît en fondu. Un élément retiré disparaît en fondu, ou vole vers l'élément `[origin]` de même id s'il existe (une pastille du dock). Il revient depuis cette pastille. Les animations s'arrêtent au démontage. |
| `Dialog`, `Popover` | Ils ont leur animation d'ouverture. N'en ajoutez pas dans un dialogue ou un menu. |

Les calculs purs (écart FLIP, cible, plan) sont dans `flip.ts` et ont des tests unitaires.
