import { test } from "bun:test";
import assert from "node:assert/strict";
import { agentCounts, navBadges } from "../../src/lib/navBadges.ts";
import { loadSidebarCollapsed, saveSidebarCollapsed, SIDEBAR_KEY } from "../../src/lib/sidebar.ts";
import { memoryStore, thread } from "../fixtures.ts";

const ask = { category: "approval" as const };

test("agentCounts counts waiting and working threads", () => {
  const counts = agentCounts([thread("a", { pending: ask }), thread("b", { status: "running" }), thread("c", { activeRunId: "r" }), thread("d", { status: "completed" }), thread("e")]);
  assert.deepEqual(counts, { waiting: 1, running: 2 });
});

test("navBadges counts running agents among the sessions windows only", () => {
  const threads = [thread("a", { status: "running" }), thread("b", { status: "running" }), thread("c", { status: "completed" })];
  assert.deepEqual(navBadges(threads, new Set(["a", "c"]), 3), { dashboardUnread: 3, sessionsRunning: 1, sessionsWaiting: false });
});

test("navBadges flags a session window that waits for an answer", () => {
  const threads = [thread("a", { pending: ask }), thread("b", { pending: ask })];
  assert.equal(navBadges(threads, new Set(["a"]), 0).sessionsWaiting, true);
  assert.equal(navBadges(threads, new Set(), 0).sessionsWaiting, false);
});

test("the collapsed sidebar is saved and read back, expanded by default", () => {
  const store = memoryStore();
  assert.equal(loadSidebarCollapsed(store), false);
  saveSidebarCollapsed(store, true);
  assert.equal(store.data.get(SIDEBAR_KEY), "collapsed");
  assert.equal(loadSidebarCollapsed(store), true);
  saveSidebarCollapsed(store, false);
  assert.equal(loadSidebarCollapsed(store), false);
});

test("a blocked storage keeps the sidebar expanded and does not throw", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(loadSidebarCollapsed(blocked), false);
  saveSidebarCollapsed(blocked, true);
  assert.equal(loadSidebarCollapsed(null), false);
});
