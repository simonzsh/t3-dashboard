import { test } from "bun:test";
import assert from "node:assert/strict";
import { loadSidebarCollapsed, saveSidebarCollapsed, SIDEBAR_KEY } from "../../src/lib/sidebar.ts";
import { memoryStore } from "../fixtures.ts";

test("the collapsed sidebar is saved and read back, expanded by default", () => {
  const store = memoryStore();
  assert.equal(loadSidebarCollapsed(store), false);
  saveSidebarCollapsed(store, true);
  assert.equal(store.data.get(SIDEBAR_KEY), "collapsed");
  assert.equal(loadSidebarCollapsed(store), true);
  saveSidebarCollapsed(store, false);
  assert.equal(loadSidebarCollapsed(store), false);
});
