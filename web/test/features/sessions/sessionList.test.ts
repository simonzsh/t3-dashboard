import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProject } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import {
  DEFAULT_LIST_PREFS,
  SESSION_LIST_KEY,
  groupByProject,
  listableThreads,
  loadListPrefs,
  parseListPrefs,
  saveListPrefs,
  sessionsBadgeCount,
  statusMark,
} from "../../../src/features/sessions/sessionList.ts";
import { memoryStore, thread } from "../../fixtures.ts";

const seenNone: SeenState = { since: "2026-01-01T00:00:00.000Z", seen: {} };
const seenAll: SeenState = { since: "2030-01-01T00:00:00.000Z", seen: {} };
const project = (id: string, title: string): DashboardProject => ({ id, title, defaultModelSelection: null, icon: null });
const at = (hour: number) => `2026-01-10T${String(hour).padStart(2, "0")}:00:00.000Z`;

test("statusMark: running, waiting and error first, then a dot for unread, else nothing", () => {
  assert.equal(statusMark(thread("a", { status: "running" }), seenAll), "running");
  assert.equal(statusMark(thread("a", { pending: { category: "approval" } }), seenAll), "waiting");
  assert.equal(statusMark(thread("a", { status: "failed" }), seenAll), "error");
  assert.equal(statusMark(thread("a", { status: "completed" }), seenNone), "unread");
  assert.equal(statusMark(thread("a", { status: "completed" }), seenAll), null);
  assert.equal(statusMark(thread("a", { status: "completed" }), { since: seenNone.since, seen: { a: at(10) } }), null);
});

test("listableThreads: drops settled threads unless they run or wait, newest first", () => {
  const listed = listableThreads([
    thread("old", { lastActivityAt: at(8) }),
    thread("settled", { settled: true, lastActivityAt: at(12) }),
    thread("new", { lastActivityAt: at(11) }),
    thread("settled-running", { settled: true, status: "running", lastActivityAt: at(9) }),
    thread("settled-waiting", { settled: true, pending: { category: "user-input" }, lastActivityAt: at(7) }),
  ]);
  assert.deepEqual(listed.map((t) => t.id), ["new", "settled-running", "old", "settled-waiting"]);
});

test("groupByProject: T3 project order, threads keep their order, the running count, and no group for an empty project", () => {
  const projects = [project("p1", "Alpha"), project("p2", "Beta"), project("p3", "Empty")];
  const threads = [
    thread("b1", { projectId: "p2", status: "running" }),
    thread("a1", { projectId: "p1", status: "completed" }),
    thread("b2", { projectId: "p2", status: "completed" }),
    thread("b3", { projectId: "p2", pending: { category: "approval" } }),
  ];
  const groups = groupByProject(threads, projects);
  assert.deepEqual(
    groups.map((g) => [g.id, g.title, g.threads.map((t) => t.id), g.running]),
    [
      ["p1", "Alpha", ["a1"], 0],
      ["p2", "Beta", ["b1", "b2", "b3"], 1],
    ],
  );
});

test("groupByProject: a thread of an unknown project gets its own group", () => {
  const groups = groupByProject([thread("x", { projectId: "gone" })], [project("p1", "Alpha")]);
  assert.deepEqual(groups.map((g) => [g.id, g.title, g.project, g.threads.length]), [["gone", "Unknown project", null, 1]]);
});

test("list prefs: defaults for missing or broken data, and a round trip through storage", () => {
  assert.deepEqual(parseListPrefs(null), DEFAULT_LIST_PREFS);
  assert.deepEqual(parseListPrefs("oops"), DEFAULT_LIST_PREFS);
  assert.deepEqual(parseListPrefs({ hidden: "yes", mode: "tree", collapsed: [1, "p1", "p1"] }), { ...DEFAULT_LIST_PREFS, collapsed: ["p1"] });
  const store = memoryStore();
  const prefs = { hidden: true, mode: "flat" as const, collapsed: ["p2"] };
  saveListPrefs(store, prefs);
  assert.ok(store.data.has(SESSION_LIST_KEY));
  assert.deepEqual(loadListPrefs(store), prefs);
});

test("sessionsBadgeCount counts running and unread rows, not waiting, read or settled ones", () => {
  const threads = [
    thread("run", { status: "running" }),
    thread("done", { status: "completed" }),
    thread("ask", { pending: { category: "approval" } }),
    thread("old", { status: "completed", settled: true }),
  ];
  assert.equal(sessionsBadgeCount(threads, seenNone), 2);
  assert.equal(sessionsBadgeCount(threads, seenAll), 1);
});
