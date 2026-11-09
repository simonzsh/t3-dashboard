import assert from "node:assert/strict";
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasAttention, onAttentionChange } from "../../src/lib/usePageAttention.ts";

const doc = (visibilityState: string, focus: boolean) => ({ visibilityState, hasFocus: () => focus });

test("the page has attention only when it shows and has the focus", () => {
  assert.equal(hasAttention(doc("visible", true)), true);
  assert.equal(hasAttention(doc("visible", false)), false);
  assert.equal(hasAttention(doc("hidden", true)), false);
  assert.equal(hasAttention(doc("hidden", false)), false);
  assert.equal(hasAttention(undefined), false);
});

test("onAttentionChange follows visibility and focus, and the remover stops it", () => {
  const win = new EventTarget();
  const page = new EventTarget();
  let calls = 0;
  const remove = onAttentionChange(win, page, () => calls++);
  page.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("focus"));
  win.dispatchEvent(new Event("blur"));
  assert.equal(calls, 3);
  remove();
  page.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("blur"));
  assert.equal(calls, 3);
});

// Guard: a session marked read in a background tab hid two finished sessions from the notifications.
test("App reads a session in front only when the page has attention", () => {
  const app = readFileSync(join(import.meta.dir, "../../src/App.tsx"), "utf8");
  assert.match(app, /const attention = usePageAttention\(\);/);
  assert.match(app, /const inFront = attention && /);
});
