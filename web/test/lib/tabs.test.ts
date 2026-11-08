import { test } from "bun:test";
import assert from "node:assert/strict";
import { TABS, hashForTab, tabFromHash } from "../../src/lib/tabs.ts";

test("the tabs are Dashboard, Sessions, Automations and News", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.label]), [["dashboard", "Dashboard"], ["sessions", "Sessions"], ["automations", "Automations"], ["news", "News"]]);
});

test("each tab has a one-line description", () => {
  for (const tab of TABS) assert.ok(tab.description.length > 0 && !tab.description.includes("\n"), tab.id);
});

test("each tab has its own hash", () => {
  assert.equal(hashForTab("dashboard"), "#/dashboard");
  assert.equal(hashForTab("sessions"), "#/sessions");
  assert.equal(hashForTab("automations"), "#/automations");
  assert.equal(hashForTab("news"), "#/news");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/dashboard"), "dashboard");
  assert.equal(tabFromHash("#/sessions"), "sessions");
  assert.equal(tabFromHash("#/automations"), "automations");
  assert.equal(tabFromHash("#/news"), "news");
});

test("no hash opens Dashboard", () => {
  assert.equal(tabFromHash(""), "dashboard");
  assert.equal(tabFromHash("#"), "dashboard");
  assert.equal(tabFromHash("#/"), "dashboard");
});

test("an unknown hash opens Dashboard", () => {
  for (const hash of ["#/agents", "#/inbox", "#/home", "#/board", "#/settings", "#/Sessions", "#/sessions/extra", "#/constructor", "#/__proto__", "sessions"]) assert.equal(tabFromHash(hash), "dashboard", hash);
});
