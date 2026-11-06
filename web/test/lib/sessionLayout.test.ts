import { test } from "bun:test";
import assert from "node:assert/strict";
import { SESSION_LAYOUT_KEY, loadSessionLayout, parseSessionLayout, saveSessionLayout } from "../../src/lib/sessionLayout.ts";
import { memoryStore } from "../fixtures.ts";

test("parseSessionLayout keeps grid and falls back to columns", () => {
  assert.equal(parseSessionLayout("grid"), "grid");
  assert.equal(parseSessionLayout("columns"), "columns");
  for (const raw of [null, "", "rows", "Grid", "{}"]) assert.equal(parseSessionLayout(raw), "columns", String(raw));
});

test("the layout survives a save and a load", () => {
  const store = memoryStore();
  assert.equal(loadSessionLayout(store), "columns");
  saveSessionLayout(store, "grid");
  assert.equal(store.data.get(SESSION_LAYOUT_KEY), "grid");
  assert.equal(loadSessionLayout(store), "grid");
});

test("without a working storage the layout is columns and saving does not throw", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, };
  assert.equal(loadSessionLayout(null), "columns");
  assert.equal(loadSessionLayout(broken), "columns");
  assert.doesNotThrow(() => saveSessionLayout(broken, "grid"));
  assert.doesNotThrow(() => saveSessionLayout(null, "grid"));
});
