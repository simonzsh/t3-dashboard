# Base components

This folder contains the base components of the dashboard. The screens in `web/src/features/` use them. Import them from `ui/index.ts`.

## Rules

- Outside `ui/`, do not write raw `<button>`, `<input>`, `<textarea>` or `<select>` elements. A test (`web/test/uiRules.test.ts`) blocks these elements. `<a>` links are still permitted.
- Menus and option lists come from the kit: `Dropdown`, `ActionMenu`, or `OptionList` with `useListNav`. A test blocks `role="listbox"`, `"menu"`, `"option"`, `"menuitem"` and `"menuitemradio"` outside `ui/`.
- In a row of buttons, put Cancel on the left and the primary action on the right. The `Dialog` applies this order.
- The accent color marks the primary action, the focus and the selection. Do not use a different color for these roles.
- The component style comes from `styles.css`. The tokens are at the top of the file: `--focus-ring`, `--radius-*`, `--control-sm` (28 px) and `--control-md` (32 px).
- Put a tooltip only on an icon with an unclear meaning, or on truncated text. Do not put one on a text button, a tab, a selector or a card.
- Do not use the native `title` attribute for a tooltip: a test blocks it. Write `tooltip` and `shortcut` (or `data-tooltip`). The accessible name stays `aria-label`.
- Each element that can get the focus gets the accent ring. Do not set `outline: none` again without a different visible focus sign.

## Components

| Component | Use |
| --- | --- |
| `Button` | Button with text. Variants: `primary` (only one in each row), `secondary` (default), `ghost`, `danger`, `link`. Sizes: `sm`, `md`. `kbd` shows a shortcut. `loading` disables the button; a text then replaces the label. |
| `IconButton` | Button with only an icon. `label` is mandatory: it gives the accessible name. Add `tooltip` only if the icon is not clear by itself (window controls, attach, send). Same variants and sizes as `Button`. |
| `Pressable` | Clickable surface with its own style: card, row, tab, pill. No variant, no fixed height. Use `Button` or `IconButton` for a normal button. |
| `TextInput`, `TextArea` | Text field. Autofill is disabled. |
| `SecretInput` | Masked field for a key or a token. It is a text field, not a password field: password managers do not open. |
| `Choice` | Checkbox or radio button (`type="checkbox"` or `type="radio"`). |
| `FileInput` | Hidden file field. A button opens it with `ref.current.click()`. |
| `Dialog` | Modal window: title, close cross at the top right, Escape and outside click to close. `onCancel`, `secondary` and `primary` add the action row. It renders itself in `document.body`: do not wrap it in a portal. On a phone (700 px or less) it is a bottom sheet: full width, a grip, the head and the actions stay in view, and a drag down on the head closes it. |
| `Sheet` | Side sheet under the header, always mounted. `open` slides it in and out and fades the backdrop. `width`: `narrow` (380 px) or `wide` (600 px). Backdrop click and Escape call `onClose`; the focus goes in and comes back; Tab stays inside. |
| `ActionMenu` | The "…" button of a row and its menu. `items` are `{ label, icon, onSelect, danger?, disabled?, tooltip? }`. The arrows move between items; Escape gives the focus back. Use it for every row menu, with no separator. |
| `CardHead` | Header of a card: icon, title, a note (a muted word or a menu), count and icon buttons on the right. |
| `Badge` | Status label: `waiting`, `running`, `done`, `error`, `neutral`. |
| `Dropdown` | Choice menu. Use it in place of `<select>`. A filter field appears for long lists. |
| `Popover` | Panel attached next to an element. Escape and outside click close it. |
| `Segmented` | Single choice between some visible options (for example the theme). |
| `Switch` | On/off setting that acts at once (pause an automation). `role="switch"`; `label` gives the accessible name. |
| `ToggleGroup` | Several options that each turn on and off (for example the weekdays). The "on" look is the same gray as `Segmented`. |
| `Kbd` | Keyboard shortcut. `className` is optional. |
| `ButtonLink`, `IconButtonLink` | Link (`<a href>`) with the look of `Button` or `IconButton`. Same variants and sizes. Use them in place of `<a className="btn">`. |
| `CountBadge` | Count bubble: nothing at 0, `max+` above `max` (99 by default). `label` gives it `role="img"` and a name; `hidden` removes it from the accessibility tree. |
| `SearchField` | Text field with a search icon. `className` goes on the wrapper, `ref` and the other props on the input. |
| `Chevron` | Disclosure arrow: right when closed, down when open. `opensUp` is for a block that grows upward (down closed, up open). |
| `OptionList` | Listbox of option rows that never take the focus. The owner keeps the focus in a field and passes `active`, `itemId` and `onHover` from `useListNav`. `isSelected` marks the current value of a choice list. |
| `useListNav` | Active row and keys of a list: arrows wrap, Home/End jump, Enter picks (Space too with `space`). `itemId` scrolls the active row into view. `nextActive` is the pure part. |
| `onRadioKeyDown`, `rovingTabIndex` | Arrow keys and one tab stop for a `role="radiogroup"` built by hand. |
| `PHONE`, `TOUCH`, `isPhone()`, `isTouch()` | The shared media queries. Use them in place of a `matchMedia("…")` string. For a hook, use `useMediaQuery(TOUCH)`. |
| `TooltipLayer` | Dashboard tooltip, mounted one time in `App`. It shows immediately on hover and on keyboard focus of an element with `data-tooltip` (and `data-shortcut` for the shortcut, in a frame). It closes when the pointer leaves, on click, on scroll and with Escape. It does not exist on a touch screen. `Button`, `IconButton` and `Pressable` set these attributes with `tooltip` and `shortcut`. On a different element, write `data-tooltip`. |
| `PageHeader` | Top of a page: title, one-line description, at most three actions on the right. `leading` goes before the title (the logo on a phone). |
| `Loader` | Loading state: the animated logo, centered in the area. Use it in place of a "Loading…" text. |
| `Icon` | Lucide icon by its name. |
| `Logo` | The app mark, drawn with the current text colour. |

## Animations

The animations use the Web Animations API (`element.animate`), without a library. They last 160 to 320 ms. With `prefers-reduced-motion: reduce`, no animation plays. They do not block clicks and do not change the layout.

| Tool | Use |
| --- | --- |
| `fly(source, target)` | A light copy of `source` (its frame and its first line) flies to `target` and shrinks. The target then bounces a little. Example: the + button of an agent card to the Sessions tab. |
| `useFlip(root, key, { item })` | Animates the `[item]` elements of `root` at each change of `key` (FLIP technique). A kept element slides to its new position. A new element fades in. A removed element fades out. The animations stop at unmount. |
| `Dialog`, `Popover` | They have their own open animation. Do not add one in a dialog or a menu. |

The pure calculations (FLIP offset, target, plan) are in `flip.ts` and have unit tests.
