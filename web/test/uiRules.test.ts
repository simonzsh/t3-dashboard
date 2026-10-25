import assert from "node:assert/strict";
import { test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../src");
const sources = readdirSync(root, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));

interface Button {
  tag: string;
  text: string;
}

// Lowercase JSX tags only: components and TS generics (`useState<T>`) are skipped.
// A group is the buttons with the same parent element, in source order.
function buttonGroups(text: string): Button[][] {
  const groups: Button[][] = [];
  const stack: Button[][] = [[]];
  const tag = /<(\/?)([a-z][\w-]*)?(?=[\s/>])/g;
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
    if (name === "button") {
      const end = text.indexOf("</button>", tag.lastIndex);
      stack.at(-1)!.push({ tag: open, text: text.slice(tag.lastIndex, end).replace(/<[^>]*>/g, " ") });
      tag.lastIndex = end + "</button>".length;
      continue;
    }
    stack.push([]);
  }
  return groups;
}

const isPrimary = (b: Button) => /className=(\{`[^`]*|")[^"`]*\bprimary\b/.test(b.tag);
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

// A native <select> opens the system menu: the dashboard uses its own Dropdown.
test("no native select anywhere", () => {
  for (const { file, text } of sources) assert.ok(!text.includes("<select"), file);
});
