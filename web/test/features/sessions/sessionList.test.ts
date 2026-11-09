import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProject } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import {
  DEFAULT_LIST_PREFS,
  SESSION_LIST_KEY,
  groupByProject,
  listableThreads,
  recentSettledThreads,
  loadListPrefs,
  parseListPrefs,
  saveListPrefs,
  sessionsBadgeCount,
  statusMark,
  settleBlockReason,
  inactiveThreads,
  settleThreads,
  settlementFlightDelay,
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

test("groupByProject: projects with threads first in T3 order, then empty ones in T3 order", () => {
  const projects = [project("p0", "Empty first"), project("p1", "Alpha"), project("p2", "Beta"), project("p3", "Empty")];
  const threads = [
    thread("b1", { projectId: "p2", status: "running" }),
    thread("a1", { projectId: "p1", status: "completed" }),
    thread("b2", { projectId: "p2", status: "completed" }),
    thread("b3", { projectId: "p2", pending: { category: "approval" } }),
  ];
  const groups = groupByProject(threads, projects, seenAll);
  assert.deepEqual(
    groups.map((g) => [g.id, g.title, g.threads.map((t) => t.id), g.badge]),
    [
      ["p1", "Alpha", ["a1"], 0],
      ["p2", "Beta", ["b1", "b2", "b3"], 1],
      ["p0", "Empty first", [], 0],
      ["p3", "Empty", [], 0],
    ],
  );
});

test("groupByProject: an archived project shows only while it has a listed thread", () => {
  const projects = [{ ...project("p1", "Old"), archived: true }, { ...project("p2", "Gone"), archived: true }, project("p3", "Live")];
  const groups = groupByProject([thread("o1", { projectId: "p1" })], projects, seenAll);
  assert.deepEqual(groups.map((g) => g.id), ["p1", "p3"]);
});

test("groupByProject: a thread of an unknown project gets its own group", () => {
  const groups = groupByProject([thread("x", { projectId: "gone" })], [project("p1", "Alpha")], seenAll);
  assert.deepEqual(groups.map((g) => [g.id, g.title, g.project, g.threads.length]), [["gone", "Unknown project", null, 1], ["p1", "Alpha", { ...project("p1", "Alpha") }, 0]]);
});

test("groupByProject: unknown-project groups sit between projects with threads and empty ones", () => {
  const groups = groupByProject([thread("x", { projectId: "gone" }), thread("a", { projectId: "p2" })], [project("p1", "Empty"), project("p2", "Busy")], seenAll);
  assert.deepEqual(groups.map((g) => g.id), ["p2", "gone", "p1"]);
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

test("groupByProject: a project badge counts running and unread rows, and the badges add up to the nav badge", () => {
  const threads = listableThreads([
    thread("run", { projectId: "p1", status: "running" }),
    thread("done", { projectId: "p1", status: "completed" }),
    thread("ask", { projectId: "p2", pending: { category: "approval" } }),
    thread("fail", { projectId: "p2", status: "failed" }),
    thread("other", { projectId: "p2", status: "completed" }),
  ]);
  const groups = groupByProject(threads, [project("p1", "Alpha"), project("p2", "Beta")], seenNone);
  assert.deepEqual(groups.map((g) => [g.id, g.badge]), [["p1", 2], ["p2", 1]]);
  assert.equal(groups.reduce((sum, g) => sum + g.badge, 0), sessionsBadgeCount(threads, seenNone));
});

test("recent settled uses settlement time, includes the boundary and excludes active or undated threads", () => {
  const now = new Date("2026-01-11T12:00:00.000Z");
  const settled = (id: string, settledAt?: string) => thread(id, { settled: true, settledAt, lastActivityAt: "2025-01-01T00:00:00.000Z" });
  const recent = settled("recent", "2026-01-11T11:00:00.000Z");
  const threads = [
    settled("boundary", at(12)), recent, settled("old", at(11)), settled("missing"),
    settled("invalid", "bad"),
    { ...recent, id: "active", status: "running" },
    { ...recent, id: "background", backgroundWork: true },
    { ...recent, id: "waiting", pending: { category: "approval" as const } },
    { ...recent, id: "unsettled", settled: false },
  ];
  assert.deepEqual(recentSettledThreads(threads, now).map((t) => t.id), ["recent", "boundary"]);
  assert.deepEqual(recentSettledThreads([recent], new Date("2026-01-12T11:00:00.001Z")), []);
});

test("a live settlement appears before the display clock next ticks", () => {
  const displayTime = new Date("2026-01-11T12:00:00.000Z");
  const recent = thread("just-settled", { settled: true, settledAt: "2026-01-11T12:00:01.000Z" });
  assert.deepEqual(recentSettledThreads([recent], displayTime).map((t) => t.id), ["just-settled"]);
  assert.deepEqual(recentSettledThreads([{ ...recent, settled: false }], displayTime), []);
});

test("settle blocks all working sessions and requests but keeps unsettle available", () => {
  for (const status of ["preparing", "queued", "starting", "running", "waiting"]) {
    assert.ok(settleBlockReason(thread("active", { status })));
  }
  assert.ok(settleBlockReason(thread("active-id", { activeRunId: "run" })));
  assert.ok(settleBlockReason(thread("approval", { pending: { category: "approval" } })));
  assert.equal(settleBlockReason(thread("done", { status: "completed" })), null);
  assert.ok(settleBlockReason(thread("background", { status: "completed", backgroundWork: true })));
  assert.equal(settleBlockReason(thread("settled", { settled: true, status: "running" })), null);
});

test("bulk settlement selects only available sessions strictly older than three days", () => {
  const now = new Date("2026-01-11T12:00:00.000Z");
  const old = thread("old", { lastActivityAt: "2026-01-08T11:59:59.999Z" });
  const threads = [
    old,
    { ...old, id: "settled", settled: true },
    { ...old, id: "running", status: "running" },
    { ...old, id: "background", backgroundWork: true },
    { ...old, id: "waiting", pending: { category: "approval" as const } },
    { ...old, id: "queued", status: "queued" },
    { ...old, id: "boundary", lastActivityAt: "2026-01-08T12:00:00.000Z" },
    { ...old, id: "invalid", lastActivityAt: "invalid" },
  ];
  assert.deepEqual(inactiveThreads(threads, now).map((t) => t.id), ["old"]);
});

test("bulk settlement continues after a failure and reports the failed count", async () => {
  const called: string[] = [];
  await assert.rejects(settleThreads([thread("a"), thread("b"), thread("c")], async (id, settled) => {
    assert.equal(settled, true);
    called.push(id);
    if (id === "b") throw new Error("refused");
  }), /1 of 3 sessions could not be settled/);
  assert.deepEqual(called, ["a", "b", "c"]);
  await settleThreads([], async () => { assert.fail("no request expected"); });
});


test("bulk flights fit within 1.5 seconds, including the dialog and arrival", () => {
  for (const count of [1, 12, 200, 1000]) {
    const last = settlementFlightDelay(count - 1, count, 0)!;
    assert.ok(last + 560 <= 1500);
  }
  assert.equal(settlementFlightDelay(0, 12, 0), 160);
  assert.equal(settlementFlightDelay(1, 12, 0), 220);
  assert.equal(settlementFlightDelay(1, 200, 500), 0);
  assert.equal(settlementFlightDelay(199, 200, 941), null);
});
