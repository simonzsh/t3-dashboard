import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memoryStore } from "../../fixtures.ts";
import { TINT_KEY, loadTint, parseTint, saveTint } from "../../../src/features/settings/tint.ts";

test("the tint is off unless it was turned on", () => {
  assert.equal(parseTint("on"), true);
  assert.equal(parseTint("off"), false);
  assert.equal(parseTint(null), false);
  assert.equal(parseTint("yes"), false);
});

test("the tint survives a reload", () => {
  const store = memoryStore();
  assert.equal(loadTint(store), false);
  saveTint(store, true);
  assert.equal(store.data.get(TINT_KEY), "on");
  assert.equal(loadTint(store), true);
  saveTint(store, false);
  assert.equal(loadTint(store), false);
});

test("styles.css and index.html know the tint", () => {
  const css = readFileSync(new URL("../../../src/styles.css", import.meta.url), "utf8");
  assert.ok(css.includes(':root[data-tint="on"] {'));
  assert.ok(css.includes(':root[data-theme="dark"][data-tint="on"] {'));
  const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
  assert.ok(html.includes(`localStorage.getItem("${TINT_KEY}")`));
});
