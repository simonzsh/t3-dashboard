import assert from "node:assert/strict";
import { test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tsxSources } from "./fixtures.ts";
import { STATUS_ICONS } from "../src/ui/statusIcons.ts";

const sources = tsxSources();

test("notification unread rings and read actions share the row center", () => {
  const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8");
  assert.match(css, /\.notif-row > \.notif-dot\s*\{[^}]*align-self: center;[^}]*margin: 0;/);
  assert.match(css, /\.notif-item > \.thread-actions\s*\{[^}]*top: 50%;[^}]*bottom: auto;[^}]*transform: translateY\(-50%\);/);
});

interface Button {
  tag: string;
  text: string;
}

// Lowercase JSX tags and the kit Button only: other components and TS generics (`useState<T>`) are skipped.
// A group is the buttons with the same parent element, in source order.
function buttonGroups(text: string): Button[][] {
  const groups: Button[][] = [];
  const stack: Button[][] = [[]];
  const tag = /<(\/?)([a-z][\w-]*|Button)?(?=[\s/>])/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(text))) {
    const [, closing, name] = match;
    if (name === undefined && closing === "") continue;
    let i = tag.lastIndex;
    let depth = 0;
    let quote: string | null = null;
    for (; i < text.length; i++) {
      const c = text[i]!;
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const open = text.slice(match.index, i + 1);
    tag.lastIndex = i + 1;
    if (closing) {
      const children = stack.pop() ?? [];
      if (children.length > 1) groups.push(children);
      if (stack.length === 0) stack.push([]);
      continue;
    }
    if (open.endsWith("/>")) continue;
    if (name === "button" || name === "Button") {
      const close = `</${name}>`;
      const end = text.indexOf(close, tag.lastIndex);
      // "<button>" in a comment has no closing tag: stop here instead of scanning the file again forever.
      if (end < 0) break;
      stack.at(-1)!.push({ tag: open, text: text.slice(tag.lastIndex, end).replace(/<[^>]*>/g, " ") });
      tag.lastIndex = end + close.length;
      continue;
    }
    stack.push([]);
  }
  return groups;
}

const isPrimary = (b: Button) => /className=(\{`[^`]*|")[^"`]*\bprimary\b/.test(b.tag) || /variant="primary"/.test(b.tag);
const isCancel = (b: Button) => /\b(Cancel|Dismiss|Decline)\b/.test(b.text) || /aria-label="(Cancel|Dismiss|Decline)/.test(b.tag);

test("Cancel comes before the primary button in every button row", () => {
  const wrong: string[] = [];
  for (const { file, text } of sources) {
    for (const group of buttonGroups(text)) {
      const primary = group.findIndex(isPrimary);
      const late = primary === -1 ? undefined : group.slice(primary + 1).find(isCancel);
      if (late) wrong.push(`${file}: ${late.text.trim()} comes after the primary button`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("the guard sees a Cancel after a primary button", () => {
  const groups = buttonGroups(`<div className="buttons"><button className="primary" onClick={() => go(a > b)}>Create</button><button type="button">Cancel</button></div>`);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]!.map((b) => [isPrimary(b), isCancel(b)]), [[true, false], [false, true]]);
});

test("the button guard ends on a button tag with no closing tag", () => {
  assert.deepEqual(buttonGroups("// a sticky <button> in a comment"), []);
});

test("the guard sees a kit Button row", () => {
  const groups = buttonGroups(`<div><Button variant="primary" onClick={go}>Save</Button><Button>Cancel</Button></div>`);
  assert.deepEqual(groups[0]!.map((b) => [isPrimary(b), isCancel(b)]), [[true, false], [false, true]]);
});

// Controls come from web/src/ui: it holds the focus ring, the heights and the autofill guard.
// A native <select> opens the system menu, so not even ui/ has one: it uses its own Dropdown.
test("no raw button, input or textarea outside web/src/ui, and no native select anywhere", () => {
  const raw = sources.filter(({ file }) => !file.startsWith("ui/")).flatMap(({ file, text }) => [...text.matchAll(/<(button|input|textarea|select)\b/g)].map((m) => `${file}: <${m[1]}`));
  assert.deepEqual(raw, []);
  for (const { file, text } of sources) assert.ok(!text.includes("<select"), file);
});

// Native `title` waits before it shows and cannot hold a shortcut frame: tooltips use `tooltip` / `data-tooltip`.
// SVG <title> and iframe title are accessible names, so only lowercase HTML tags and the kit buttons are checked.
function nativeTitles(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/<(Button|IconButton|Pressable|[a-z][\w-]*)\b/g)) {
    const name = m[1]!;
    if (name === "title" || name === "svg" || name === "iframe") continue;
    let depth = 0;
    let quote: string | null = null;
    let i = m.index! + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i]!;
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    if (/\stitle=/.test(text.slice(m.index!, i))) found.push(name);
  }
  return found;
}

// A menu or list written by hand misses the kit's hover, arrow keys, Home/End and focus rules.
const MENU_ROLE = /\srole="(listbox|menu|option|menuitem|menuitemradio)"/;
// Files that must keep a hand-made menu role, with the reason. Keep it empty if you can.
const MENU_ROLE_ALLOWED = new Map<string, string>();

test("menus and option lists come from the kit outside web/src/ui", () => {
  const wrong = sources.filter(({ file, text }) => !file.startsWith("ui/") && !MENU_ROLE_ALLOWED.has(file) && MENU_ROLE.test(text)).map(({ file }) => file);
  assert.deepEqual(wrong, [], "use Dropdown, ActionMenu, or OptionList with useListNav");
});

test("the menu guard sees a role attribute but not a selector string", () => {
  assert.ok(MENU_ROLE.test('<div role="listbox">'));
  assert.ok(!MENU_ROLE.test(`el.closest('[role="menu"]')`));
});

test("no HTML element or kit button sets a native title attribute", () => {
  const bad = sources.flatMap(({ file, text }) => nativeTitles(text).map((name) => `${file}: <${name} title=`));
  assert.deepEqual(bad, []);
});

test("the title guard sees HTML elements and kit buttons but not SVG titles or component props", () => {
  assert.deepEqual(nativeTitles(`<span className="a" title={x}>t</span>`), ["span"]);
  assert.deepEqual(nativeTitles(`<IconButton label="A" title="B (K)" onClick={() => go(a > b)}>x</IconButton>`), ["IconButton"]);
  assert.deepEqual(nativeTitles(`<svg><title>Done</title></svg><Dialog title="Settings" onClose={f} />`), []);
});

// The Pull requests refresh buttons once only greyed out while loading: every refresh that waits spins, like the cards.
const RETRY_ICONS = new Set(["features/conversation/Composer.tsx"]);
function staticRefreshIcons(text: string): number {
  return [...text.matchAll(/<Icon name="refresh"(?![^>]*className)[^>]*\/>/g)].length;
}

test("a refresh icon spins while its load runs", () => {
  const still = sources.filter(({ file, text }) => !RETRY_ICONS.has(file) && staticRefreshIcons(text) > 0).map(({ file }) => file);
  assert.deepEqual(still, []);
  const busy = sources.filter(({ text }) => /\brefreshing\b/.test(text) && /"refresh"/.test(text) && !text.includes("spinning")).map(({ file }) => file);
  assert.deepEqual(busy, []);
});

test("the refresh guard sees an icon with no busy class", () => {
  assert.equal(staticRefreshIcons(`<IconButton disabled={busy}><Icon name="refresh" /></IconButton>`), 1);
  assert.equal(staticRefreshIcons(`<Icon name="refresh" className={busy ? "icon spinning" : "icon"} />`), 0);
});

// A CSS cleanup once dropped this rule and left dialog buttons glued together.
test("button rows are spaced and dialog actions sit on the right", async () => {
  const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
  assert.match(css, /^\.buttons \{[^}]*display: flex;[^}]*gap: 8px;/m);
  assert.match(css, /^\.dialog-actions[^{]*\{[^}]*justify-content: flex-end;/m);
});

// scrollIntoView and scrollTo return a Promise in recent Chrome: as an effect's value, React calls it as a cleanup and crashes.
test("no effect returns the result of a scroll call", () => {
  const bad = sources.flatMap(({ file, text }) =>
    [...text.matchAll(/use(?:Layout)?Effect\(\(\) => (?!\{|void )[^\n]*\.(?:scrollIntoView|scrollTo|scrollBy)\(/g)].map(() => file),
  );
  assert.deepEqual(bad, []);
});

test("menus come from the kit, so hover and keys behave the same everywhere", () => {
  const wrong = sources.filter(({ file, text }) => !file.startsWith("ui/") && /\bdropdown-(option|list)\b/.test(text)).map(({ file }) => file);
  assert.deepEqual(wrong, [], "use Dropdown or ActionMenu instead of hand-made menu rows");
});

// --- Page shell: one block in styles.css spaces every page (docs/development.md). ---
const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
const SHELL_START = "/* page-shell:start";
const SHELL_END = "/* page-shell:end */";
const PAGE_ROOTS = [".dashboard", ".auto-page", ".news-page", ".pulls-page", ".sessions"];
const SPACING = /(^|;)\s*(padding|margin|max-width)(-[a-z-]+)?\s*:/;

// Flat rules, media queries opened: [selector list, declarations].
const rulesOf = (text: string): Array<[string, string]> =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!]);

test("automation sheet sections keep their content height inside the scrolling body", () => {
  const rules = new Map(rulesOf(css));
  for (const selector of [".auto-section", ".auto-facts"]) {
    assert.match(rules.get(selector) ?? "", /\bflex:\s*none\s*;/, `${selector} must not stretch or shrink`);
  }
  assert.match(rules.get(".auto-sheet-body") ?? "", /overflow-y:\s*auto\s*;/);
});

// The classes a page passes to its ListPage, or puts on its scroll box: they belong to the shell too.
function shellClasses(): string[] {
  const out = new Set<string>();
  for (const { text } of sources) {
    for (const m of text.matchAll(/<ListPage\b[^>]*?\b(?:className|headClassName|bodyClassName)="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/)) out.add(`.${c}`);
    for (const m of text.matchAll(/className="([^"]*\bpage-scroll\b[^"]*)"/g)) for (const c of m[1]!.split(/\s+/)) out.add(`.${c}`);
  }
  out.delete(".page-scroll");
  return [...out];
}

// The element a selector styles: its last compound, pseudo-classes (and what they hold) dropped.
const subjectOf = (selector: string): string =>
  selector.replace(/:{1,2}[\w-]+(\([^)]*\))?/g, "").split(/[\s>+~]+/).filter(Boolean).pop() ?? "";

function shellViolations(text: string): string[] {
  const start = text.indexOf(SHELL_START);
  const end = text.indexOf(SHELL_END);
  const outside = start < 0 || end < 0 ? text : text.slice(0, start) + text.slice(end + SHELL_END.length);
  const guarded = [...PAGE_ROOTS, ...shellClasses(), ".list-page", ".list-page-head", ".list-page-body", ".page-scroll"];
  const hits: string[] = [];
  for (const [selectors, body] of rulesOf(outside)) {
    if (!SPACING.test(body)) continue;
    for (const selector of selectors.split(",").map((part) => part.trim())) {
      const subject = subjectOf(selector);
      const classes = subject.match(/\.[\w-]+/g) ?? [];
      if (/^main\b/.test(subject) || classes.some((cls) => guarded.includes(cls))) hits.push(selector);
    }
  }
  return hits;
}

test("only the page-shell block spaces a page: no padding, margin or max-width on main, a page root or a list page outside it", () => {
  assert.ok(css.includes(SHELL_START) && css.includes(SHELL_END), "styles.css keeps its page-shell markers");
  assert.ok(shellClasses().length > 0, "the guard finds the classes pages pass to the shell");
  for (const root of PAGE_ROOTS) assert.ok(css.includes(`${root} {`), `${root} is still a page root`);
  assert.deepEqual(shellViolations(css), []);
});

test("the page-shell guard sees page-level spacing outside the block", () => {
  const add = (rule: string) => shellViolations(`${css}\n${rule}\n`);
  assert.deepEqual(add("main:has(> .x-page) { padding-top: 8px; }"), ["main:has(> .x-page)"]);
  assert.deepEqual(add("@media (max-width: 700px) { .auto-page { padding-inline: 12px; } }"), [".auto-page"]);
  assert.deepEqual(add(".news-list { margin: -4px; }"), [".news-list"]);
  assert.deepEqual(add(".pulls-list .list-page-body { max-width: 960px; }"), [".pulls-list .list-page-body"]);
  assert.deepEqual(add(".pulls-row { padding: 4px; }"), []);
});

test("every control in the session header is a kit icon button, so all share one size", () => {
  const window = sources.find(({ file }) => file.endsWith("features/sessions/SessionWindow.tsx"))!.text;
  const start = window.indexOf('<span className="session-window-buttons">');
  const block = window.slice(start, window.indexOf("</span>", start));
  // Text buttons (Button, or an ActionMenu with text) are taller or wider than the icon buttons beside them.
  assert.doesNotMatch(block, /<Button\b|\btext=/);
  const menu = window.slice(window.indexOf("function PullRequestsButton"), window.indexOf("export const SessionWindow"));
  assert.doesNotMatch(menu, /<Button\b|\btext=/);
});

// --- Toolbars: one control height, so a segmented control or a menu never moves a page's list down. ---
const TOOLBAR_CONTROLS = [".segmented", ".search-field .field", ".dropdown-trigger", ".tabs button", ".btn.md", ".icon-button.md"];
const SIZING = /(^|;)\s*(height|min-height|max-height|padding(-top|-bottom|-block)?|border(-width|-top|-bottom)?)\s*:/;
const TOKEN_RULE = /\.list-page-head :is\(([^)]*)\) \{ height: var\(--toolbar-control\); \}/;

// Classes of the pages built on ListPage: a sizing rule under one of them could size a toolbar control apart.
function pageClasses(): string[] {
  const out = new Set<string>([".list-page-head"]);
  for (const { text } of sources) {
    if (!/<ListPage\b/.test(text)) continue;
    for (const m of text.matchAll(/className="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/)) if (c) out.add(`.${c}`);
  }
  return [...out];
}

function toolbarViolations(text: string): string[] {
  const start = text.indexOf(SHELL_START);
  const end = text.indexOf(SHELL_END);
  const outside = text.slice(0, start) + text.slice(end + SHELL_END.length);
  const pages = pageClasses();
  const hits: string[] = [];
  for (const [selectors, body] of rulesOf(outside)) {
    if (!SIZING.test(body)) continue;
    for (const selector of selectors.split(",").map((part) => part.trim())) {
      const parts = selector.split(/\s+/);
      const ancestors = parts.slice(0, -1).join(" ");
      if (!pages.some((cls) => new RegExp(`${cls.replace(".", "\\.")}(?![\\w-])`).test(ancestors))) continue;
      if (TOOLBAR_CONTROLS.some((control) => selector.endsWith(control.split(" ").pop()!) || selector.includes(control))) hits.push(selector);
    }
  }
  return hits;
}

test("every toolbar control kind takes the one toolbar height token, set in the page-shell block", () => {
  const shell = css.slice(css.indexOf(SHELL_START), css.indexOf(SHELL_END));
  assert.match(shell, /--toolbar-control: var\(--control-md\);/);
  const covered = shell.match(TOKEN_RULE)?.[1]?.split(",").map((s) => s.trim()) ?? [];
  assert.deepEqual([...covered].sort(), [...TOOLBAR_CONTROLS].sort());
  // The md buttons already have this height: the token must stay equal to it.
  assert.match(css, /\.btn\.md \{ height: var\(--control-md\);/);
  assert.match(css, /\.icon-button\.md \{ min-width: var\(--control-md\); height: var\(--control-md\);/);
});

test("no page sizes a toolbar control on its own", () => {
  assert.deepEqual(toolbarViolations(css), []);
});

test("the toolbar guard sees a page that sizes one of its toolbar controls", () => {
  assert.deepEqual(toolbarViolations(`${css}\n.news-list .segmented { padding: 3px; }\n`), [".news-list .segmented"]);
  assert.deepEqual(toolbarViolations(`${css}\n.pulls-list .dropdown-trigger { height: 26px; }\n`), [".pulls-list .dropdown-trigger"]);
  assert.deepEqual(toolbarViolations(`${css}\n.model-footer .segmented { padding: 2px; }\n`), []);
});

// --- List toolbar: one kit component (ListToolbar) and one set of rules in the page-shell block. ---
const TOOLBAR_CLASS = /\b(list-toolbar|auto-(toolbar|search|sort|filter))\b/;
const TOOLBAR_SELECTOR = /\.(list-toolbar|auto-(toolbar|search|sort|filter))\b/;

// Features render <ListToolbar>: they never name its classes, nor bring back the old Automations names.
const toolbarClassUsers = (files: Array<{ file: string; text: string }>): string[] =>
  files.filter(({ file, text }) => !file.startsWith("ui/") && TOOLBAR_CLASS.test(text)).map(({ file }) => file);

function localToolbarRules(text: string): string[] {
  const start = text.indexOf(SHELL_START);
  const end = text.indexOf(SHELL_END);
  const outside = text.slice(0, start) + text.slice(end + SHELL_END.length);
  return rulesOf(outside).flatMap(([selectors]) => selectors.split(",").map((part) => part.trim())).filter((selector) => TOOLBAR_SELECTOR.test(selector));
}

test("the list toolbar is styled only in the page-shell block, and features use it only through ListToolbar", () => {
  assert.ok(sources.filter(({ text }) => /<ListToolbar\b/.test(text)).length >= 3, "the guard finds the pages that use ListToolbar");
  assert.deepEqual(toolbarClassUsers(allSources), []);
  assert.deepEqual(localToolbarRules(css), []);
});

test("the list toolbar guard sees a feature that uses or styles the toolbar on its own", () => {
  assert.deepEqual(toolbarClassUsers([{ file: "features/news/X.tsx", text: '<div className="list-toolbar">' }]), ["features/news/X.tsx"]);
  assert.deepEqual(toolbarClassUsers([{ file: "features/pulls/X.tsx", text: '<SearchField className="auto-search" />' }]), ["features/pulls/X.tsx"]);
  assert.deepEqual(toolbarClassUsers([{ file: "ui/ListToolbar.tsx", text: '<div className="list-toolbar">' }]), []);
  assert.deepEqual(localToolbarRules(`${css}\n.news-list .list-toolbar { gap: 4px; }\n`), [".news-list .list-toolbar"]);
  assert.deepEqual(localToolbarRules(`${css}\n.auto-toolbar { gap: 4px; }\n`), [".auto-toolbar"]);
  assert.deepEqual(localToolbarRules(`${css}\n.x { grid-auto-flow: row; }\n`), []);
});

// --- Page choices: filters, sorts and views persist through one helper (lib/storage.ts). ---
const FILTER_CONTROL = /<(Segmented|Dropdown|Tabs|ToggleGroup)\b[^>]*?\bvalue=\{([^}]*)\}/g;

function unsavedFilters(text: string): string[] {
  if (!/<ListPage\b/.test(text)) return [];
  const local = new Set([...text.matchAll(/const \[(\w+), \w+\] = useState\b/g)].map((m) => m[1]!));
  return [...text.matchAll(FILTER_CONTROL)].filter((m) => (m[2]!.match(/\w+/g) ?? []).some((name) => local.has(name))).map((m) => `${m[1]} value={${m[2]}}`);
}

test("the filters of a list page are kept with usePrefs, not in local state", () => {
  const found = sources.flatMap(({ file, text }) => unsavedFilters(text).map((hit) => `${file}: ${hit}`));
  assert.deepEqual(found, []);
});

test("the filter guard sees a list filter held in useState", () => {
  const page = `const [scope, setScope] = useState("all");\nreturn <ListPage head={<Segmented label="Show" value={scope} options={SCOPES} onChange={setScope} />} />;`;
  assert.deepEqual(unsavedFilters(page), ["Segmented value={scope}"]);
  assert.deepEqual(unsavedFilters(page.replace("<ListPage", "<div")), []);
});

const allSources = (() => {
  const root = join(import.meta.dir, "../src");
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({ file, text: readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "") }));
})();

test("only lib/storage.ts touches browser storage, and every prefs hook goes through usePrefs", () => {
  assert.deepEqual(allSources.filter(({ file, text }) => file !== "lib/storage.ts" && /\b(localStorage|sessionStorage)\b/.test(text)).map(({ file }) => file), []);
  const hooks = allSources.filter(({ file, text }) => file !== "lib/storage.ts" && /export (const|function) use\w*Prefs\b/.test(text));
  assert.ok(hooks.length >= 3, "the guard finds the prefs hooks");
  assert.deepEqual(hooks.filter(({ text }) => !/\busePrefs\(/.test(text)).map(({ file }) => file), []);
});


test("tooltip measurements do not shrink to the space left by their previous position", () => {
  const rule = css.match(/^\.tooltip \{([^}]+)\}/m)?.[1];
  assert.ok(rule);
  assert.match(rule, /width: max-content;/);
  assert.match(rule, /max-width: min\(320px, calc\(100vw - 8px\)\);/);
});

test("a dragged session header keeps its source width and pointer offset", () => {
  const rule = css.match(/^\.sessions-drag-ghost \{([^}]+)\}/m)?.[1];
  assert.ok(rule);
  assert.match(rule, /max-width: none;/);
  assert.doesNotMatch(rule, /(?:^|;)\s*(?:width|min-width):/);
});

test("full-screen session and pull request headers share the iOS top-edge fix", () => {
  const rule = css.match(/\.app\.session-shown :is\(\.banner, \.sessions\.compact \.session-window-head\),\s*\.app\.pr-shown :is\(\.banner, \.pulls-detail > \.list-page-head\) \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /position: sticky;/);
  assert.match(rule, /top: 0;/);
  assert.match(rule, /z-index: 4;/);
});

test("mobile session header spacing cannot replace its focus tint", () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  const mobileHeaders = rules.filter(([, selector]) => selector!.includes(".sessions.compact .session-window-head"));
  assert.ok(mobileHeaders.length > 0);
  for (const [, , declarations] of mobileHeaders) {
    assert.doesNotMatch(declarations!, /\bbackground(?:-color)?\s*:/);
  }
});

test("menu icons preserve semantic status colors before the neutral fallback", () => {
  const css = readFileSync("web/src/styles.css", "utf8");
  const rule = css.match(/\.dropdown-option\[role="menuitem"\] > \.icon \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /color: var\(--pr-status, var\(--text-secondary\)\)/);
});

test("agent status consumers use the shared icon mapping", () => {
  const consumers = ["ui/Badge.tsx", "features/sessions/SessionList.tsx", "features/shell/AppNav.tsx", "features/dashboard/sections.ts"];
  for (const file of consumers) {
    const source = allSources.find(source => source.file === file);
    assert.ok(source, file);
    assert.match(source.text, /\bSTATUS_ICONS[.[]/, file);
    assert.doesNotMatch(source.text, /(?:name=|icon:\s*)["'](?:diamond|alert|user)["']/, file);
  }
  const directWaitingIcon = new RegExp(`["']${STATUS_ICONS.waiting}["']`);
  assert.deepEqual(allSources.filter(({ file, text }) => file !== "ui/statusIcons.ts" && directWaitingIcon.test(text)).map(source => source.file), []);
});

test("session search consumes requests before Activity can restart its effect", () => {
  const source = readFileSync("web/src/features/conversation/ConversationPanel.tsx", "utf8");
  assert.match(source, /const handledSearchRequest = useRef\(searchRequest\)/);
  assert.match(source, /if \(searchRequest === handledSearchRequest\.current\) return;\s*handledSearchRequest\.current = searchRequest;\s*if \(!searchRequest\) return;\s*setSearchOpen\(true\)/);
});

test("running dots use the shared component and its one halo animation", () => {
  const directDots = sources.filter(({ file, text }) => file !== "ui/RunningDot.tsx" && [...text.matchAll(/className=["']([^"']*)["']/g)].some(match => match[1]!.split(/\s+/).includes("pulse")));
  assert.deepEqual(directDots.map(source => source.file), []);
  assert.doesNotMatch(css, /work-group-dot|\.slist-mark\.running::after/);
  assert.match(css, /\.pulse::after \{[^}]*animation: ping 1\.6s/);
});

test("subagent fallback status leaves room for the running halo without unclipping progress text", () => {
  assert.match(css, /\.subagent-title, \.subagent-line \{[^}]*overflow: hidden;/);
  assert.match(css, /\.subagent-line:has\(> \.subagent-state\) \{[^}]*overflow: visible;/);
});

test("settings notes and action rows can wrap inside the dialog", () => {
  const note = css.match(/\.about-note \{([^}]+)\}/)?.[1];
  assert.ok(note);
  assert.match(note, /white-space: normal;/);
  assert.match(note, /overflow-wrap: anywhere;/);
  assert.match(css, /\.settings-row > \.row-icons \{[^}]*flex-wrap: wrap;/);
});


test("incoming questions never autofocus their composer", async () => {
  const source = await Bun.file("web/src/features/conversation/ConversationPanel.tsx").text();
  assert.doesNotMatch(source, /focusKey=\{question\.composer\./);
  const dock = await Bun.file("web/src/features/conversation/QuestionDock.tsx").text();
  assert.doesNotMatch(dock, /focusKey|autoFocus|\.focus\(/);
});


test("conversation robots stay in the scrolling messages instead of a fixed dock", () => {
  const source = readFileSync("web/src/features/conversation/ConversationPanel.tsx", "utf8");
  const scrollStart = source.indexOf('className="messages"');
  const scrollEnd = source.indexOf('{!atBottom &&', scrollStart);
  assert.ok(scrollStart >= 0 && scrollEnd > scrollStart);
  const robots = [...source.matchAll(/<WorkingRobot (waiting|sleeping|background)\b/g)];
  assert.deepEqual(robots.map(robot => robot[1]).sort(), ["background", "sleeping", "waiting"]);
  for (const robot of robots) {
    assert.ok(robot.index > scrollStart && robot.index < scrollEnd, `${robot[1]} robot must scroll with messages`);
  }
  assert.doesNotMatch(source + css, /input-request-dock/);
});


test("background activity keeps a visible robot after the main run ends", () => {
  const source = readFileSync("web/src/features/conversation/ConversationPanel.tsx", "utf8");
  assert.match(source, /!running && background && !needsInput && \([\s\S]*?<Loader inline label="Background activity" \/>[\s\S]*?<WorkingRobot background \/>/);
});

test("the Thinking fallback always gives the robot a thinking pose", () => {
  const source = readFileSync(new URL("../src/features/conversation/ConversationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /<span>Thinking…<\/span>\s*<WorkingRobot thinking \/>/);
});

test("the background robot clock uses accent color for its outline and hands", () => {
  const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8");
  for (const selector of [".robot-clock", ".robot-clock::after", ".robot-clock span"]) {
    const rule = css.slice(css.indexOf(selector + " {")).split("}")[0]!;
    assert.ok(rule.includes("var(--accent)"), selector);
    assert.ok(!rule.includes("var(--robot-light)"), selector);
  }
});

test("panels retain the original slide without scaling the page", () => {
  const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8");
  for (const selector of [".sidebar", ".side-panel"]) {
    const rule = css.slice(css.indexOf(selector + " {")).split("}")[0]!;
    assert.match(rule, /transition: width 160ms ease;/);
  }
  const nav = readFileSync(join(import.meta.dir, "../src/features/shell/AppNav.tsx"), "utf8");
  assert.doesNotMatch(nav, /usePanelMotion/);
});

test("working and resting robots share the compact message gap", () => {
  const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8");
  assert.ok(css.includes(".messages > :is(.working-row, .work-group:has(> .work-group-heading > .working-robot)) { margin-top: -12px; }"));
  assert.ok(!css.includes(".messages > .working-row:last-child { margin-top:"));
});

test("session panes contain layout and paint work during panel slides", () => {
  const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8");
  for (const selector of [".sessions-area", ".session-window", ".slist"]) {
    const rule = css.slice(css.indexOf(selector + " {")).split("}")[0]!;
    assert.match(rule, /contain: layout paint;/, selector);
    assert.doesNotMatch(rule, /contain:[^;]*size/, "pane sizes must still follow the layout");
  }
});

test("citation viewport anchor escapes the contained session pane", () => {
  const source = readFileSync(join(import.meta.dir, "../src/features/conversation/ConversationPanel.tsx"), "utf8");
  assert.match(source, /createPortal\(<span ref=\{quoteAnchor\}[^\n]+document\.body\)/);
});

// A section that loads keeps its title: a full-area loader would make each section of the dialog look different.
test("settings sections load with the inline row loader only", () => {
  const block = sources
    .filter(({ file }) => file.startsWith("features/settings/"))
    .flatMap(({ file, text }) => [...text.matchAll(/<Loader\b[^>]*>/g)].filter((m) => !/\binline\b/.test(m[0])).map((m) => `${file}: ${m[0]}`));
  assert.deepEqual(block, []);
});
