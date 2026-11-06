import { test } from "bun:test";
import assert from "node:assert/strict";
import { TABS, hashForTab, tabFromHash } from "../../src/lib/tabs.ts";

test("the tabs are Home, Sessions and Automations, keyed 1 to 3", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.label, t.key]), [["home", "Home", "1"], ["desk", "Sessions", "2"], ["automations", "Automations", "3"]]);
});

test("each tab has a one-line description", () => {
  for (const tab of TABS) assert.ok(tab.description.length > 0 && !tab.description.includes("\n"), tab.id);
});

test("each tab has its own hash", () => {
  assert.equal(hashForTab("home"), "#/home");
  assert.equal(hashForTab("desk"), "#/desk");
  assert.equal(hashForTab("automations"), "#/automations");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/home"), "home");
  assert.equal(tabFromHash("#/desk"), "desk");
  assert.equal(tabFromHash("#/automations"), "automations");
});

test("the old inbox hash opens Home", () => {
  assert.equal(tabFromHash("#/inbox"), "home");
});

test("no hash opens Home", () => {
  assert.equal(tabFromHash(""), "home");
  assert.equal(tabFromHash("#"), "home");
  assert.equal(tabFromHash("#/"), "home");
});

test("an unknown or old hash opens Home", () => {
  for (const hash of ["#/agents", "#/board", "#/settings", "#/Desk", "#/desk/extra", "#/constructor", "#/__proto__", "desk"]) assert.equal(tabFromHash(hash), "home", hash);
});
