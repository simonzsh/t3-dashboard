import { test } from "bun:test";
import assert from "node:assert/strict";
import { hashForTab, tabFromHash } from "../../src/lib/tabs.ts";

test("each tab has its own hash", () => {
  assert.equal(hashForTab("agents"), "#/agents");
  assert.equal(hashForTab("desk"), "#/desk");
  assert.equal(hashForTab("board"), "#/board");
});

test("a tab hash reads back as its tab", () => {
  assert.equal(tabFromHash("#/agents"), "agents");
  assert.equal(tabFromHash("#/desk"), "desk");
  assert.equal(tabFromHash("#/board"), "board");
});

test("no hash opens Agents", () => {
  assert.equal(tabFromHash(""), "agents");
  assert.equal(tabFromHash("#"), "agents");
  assert.equal(tabFromHash("#/"), "agents");
});

test("an unknown hash opens Agents", () => {
  for (const hash of ["#/settings", "#/Desk", "#/desk/extra", "#/constructor", "#/__proto__", "desk"]) assert.equal(tabFromHash(hash), "agents", hash);
});
