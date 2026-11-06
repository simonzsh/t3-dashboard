import { test } from "bun:test";
import assert from "node:assert/strict";
import { TABS, hashForTab, tabFromHash } from "../../src/lib/tabs.ts";

test("the tabs are Dashboard, Sessions and Automations, keyed 1 to 3", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.label, t.key]), [["dashboard", "Dashboard", "1"], ["sessions", "Sessions", "2"], ["automations", "Automations", "3"]]);
});

test("each tab has a one-line description", () => {
  for (const tab of TABS) assert.ok(tab.description.length > 0 && !tab.description.includes("\n"), tab.id);
});

test("each tab has its own hash", () => {
  assert.equal(hashForTab("dashboard"), "#/dashboard");
  assert.equal(hashForTab("sessions"), "#/sessions");
  assert.equal(hashForTab("automations"), "#/automations");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/dashboard"), "dashboard");
  assert.equal(tabFromHash("#/sessions"), "sessions");
  assert.equal(tabFromHash("#/automations"), "automations");
});

test("no hash opens Dashboard", () => {
  assert.equal(tabFromHash(""), "dashboard");
  assert.equal(tabFromHash("#"), "dashboard");
  assert.equal(tabFromHash("#/"), "dashboard");
});

test("an unknown hash opens Dashboard", () => {
  for (const hash of ["#/agents", "#/inbox", "#/home", "#/board", "#/settings", "#/Sessions", "#/sessions/extra", "#/constructor", "#/__proto__", "sessions"]) assert.equal(tabFromHash(hash), "dashboard", hash);
});
