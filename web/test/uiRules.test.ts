import assert from "node:assert/strict";
import { test } from "bun:test";
import { tsxSources } from "./fixtures.ts";

const sources = tsxSources();

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
