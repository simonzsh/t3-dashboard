import { test } from "bun:test";
import assert from "node:assert/strict";
import { AUTOMATIONS_LIST_KEY, DEFAULT_AUTOMATION_PREFS, loadAutomationPrefs, parseAutomationPrefs, saveAutomationPrefs } from "../../../src/features/automations/prefs.ts";
import { memoryStore } from "../../fixtures.ts";

test("the defaults show everything by recent activity", () => {
  assert.deepEqual(DEFAULT_AUTOMATION_PREFS, { filter: "all", sort: "recent" });
});

test("parseAutomationPrefs keeps known values and falls back for the rest", () => {
  assert.deepEqual(parseAutomationPrefs(null), DEFAULT_AUTOMATION_PREFS);
  assert.deepEqual(parseAutomationPrefs({ filter: "failed", sort: "project" }), { filter: "failed", sort: "project" });
  assert.deepEqual(parseAutomationPrefs({ filter: "nope", sort: 3 }), DEFAULT_AUTOMATION_PREFS);
});

test("the prefs round-trip through the store", () => {
  const store = memoryStore();
  assert.deepEqual(loadAutomationPrefs(store), DEFAULT_AUTOMATION_PREFS);
  saveAutomationPrefs(store, { filter: "paused", sort: "name" });
  assert.ok(store.data.has(AUTOMATIONS_LIST_KEY));
  assert.deepEqual(loadAutomationPrefs(store), { filter: "paused", sort: "name" });
});
