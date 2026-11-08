import assert from "node:assert/strict";
import { test } from "bun:test";
import { DEFAULT_SETUP_PREFS, loadSetupPrefs, parseSetupPrefs, saveSetupPrefs } from "../../../src/features/agent-setup/prefs.ts";
import { memoryStore } from "../../fixtures.ts";

test("parseSetupPrefs keeps a scope and a known view, and falls back for the rest", () => {
  assert.deepEqual(parseSetupPrefs(null), DEFAULT_SETUP_PREFS);
  assert.deepEqual(parseSetupPrefs({ scope: "project:p1", view: "effective" }), { scope: "project:p1", view: "effective" });
  assert.deepEqual(parseSetupPrefs({ scope: 1, view: "other" }), DEFAULT_SETUP_PREFS);
});

test("the setup prefs round-trip through the store", () => {
  const store = memoryStore();
  saveSetupPrefs(store, { scope: "project:p1", view: "effective" });
  assert.deepEqual(loadSetupPrefs(store), { scope: "project:p1", view: "effective" });
});
