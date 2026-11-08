import assert from "node:assert/strict";
import { test } from "bun:test";
import { DEFAULT_PULLS_PREFS, loadPullDetailPrefs, loadPullsPrefs, parsePullDetailPrefs, parsePullsPrefs, PULLS_LIST_KEY, savePullDetailPrefs, savePullsPrefs } from "../../../src/features/pulls/prefs.ts";
import { memoryStore } from "../../fixtures.ts";

test("the defaults show every pull request of every repository", () => {
  assert.deepEqual(DEFAULT_PULLS_PREFS, { scope: "all", repository: "all" });
});

test("parsePullsPrefs keeps known values and falls back field by field", () => {
  assert.deepEqual(parsePullsPrefs(null), DEFAULT_PULLS_PREFS);
  assert.deepEqual(parsePullsPrefs({ scope: "reviewer", repository: "acme/api" }), { scope: "reviewer", repository: "acme/api" });
  assert.deepEqual(parsePullsPrefs({ scope: "nope", repository: "acme/api" }), { scope: "all", repository: "acme/api" });
  assert.deepEqual(parsePullsPrefs({ scope: "author", repository: 3 }), { scope: "author", repository: "all" });
  assert.deepEqual(parsePullsPrefs({ scope: "author", repository: "" }), { scope: "author", repository: "all" });
});

test("the prefs round-trip through the store, and a broken value reads as the defaults", () => {
  const store = memoryStore();
  assert.deepEqual(loadPullsPrefs(store), DEFAULT_PULLS_PREFS);
  savePullsPrefs(store, { scope: "author", repository: "acme/web" });
  assert.ok(store.data.has(PULLS_LIST_KEY));
  assert.deepEqual(loadPullsPrefs(store), { scope: "author", repository: "acme/web" });
  assert.deepEqual(loadPullsPrefs(memoryStore({ [PULLS_LIST_KEY]: "{not json" })), DEFAULT_PULLS_PREFS);
});

test("the file tree shows by default, and stays hidden once hidden", () => {
  assert.deepEqual(parsePullDetailPrefs(null), { filesOpen: true });
  assert.deepEqual(parsePullDetailPrefs({ filesOpen: "no" }), { filesOpen: true });
  const store = memoryStore();
  savePullDetailPrefs(store, { filesOpen: false });
  assert.deepEqual(loadPullDetailPrefs(store), { filesOpen: false });
});
