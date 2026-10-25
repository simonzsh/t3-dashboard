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

test("no HTML element or kit button sets a native title attribute", () => {
  const bad = sources.flatMap(({ file, text }) => nativeTitles(text).map((name) => `${file}: <${name} title=`));
  assert.deepEqual(bad, []);
});

test("the title guard sees HTML elements and kit buttons but not SVG titles or component props", () => {
  assert.deepEqual(nativeTitles(`<span className="a" title={x}>t</span>`), ["span"]);
  assert.deepEqual(nativeTitles(`<IconButton label="A" title="B (K)" onClick={() => go(a > b)}>x</IconButton>`), ["IconButton"]);
  assert.deepEqual(nativeTitles(`<svg><title>Done</title></svg><Dialog title="Settings" onClose={f} />`), []);
});
