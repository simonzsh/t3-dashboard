import { test } from "bun:test";
import assert from "node:assert/strict";
import { TABS, hashForTab, tabFromHash } from "../../src/lib/tabs.ts";

test("the tabs are Desk, Inbox and Automations, keyed 1 to 3", () => {
  assert.deepEqual(TABS.map((t) => [t.id, t.label, t.key]), [["desk", "Desk", "1"], ["inbox", "Inbox", "2"], ["automations", "Automations", "3"]]);
});

test("each tab has its own hash", () => {
  assert.equal(hashForTab("desk"), "#/desk");
  assert.equal(hashForTab("inbox"), "#/inbox");
  assert.equal(hashForTab("automations"), "#/automations");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/desk"), "desk");
  assert.equal(tabFromHash("#/inbox"), "inbox");
  assert.equal(tabFromHash("#/automations"), "automations");
});

test("no hash opens the Inbox", () => {
  assert.equal(tabFromHash(""), "inbox");
  assert.equal(tabFromHash("#"), "inbox");
  assert.equal(tabFromHash("#/"), "inbox");
});

test("an unknown or old hash opens the Inbox", () => {
  for (const hash of ["#/agents", "#/board", "#/settings", "#/Desk", "#/desk/extra", "#/constructor", "#/__proto__", "desk"]) assert.equal(tabFromHash(hash), "inbox", hash);
});
