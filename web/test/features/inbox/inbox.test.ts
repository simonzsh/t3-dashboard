import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SeenState } from "../../../../shared/seen.ts";
import { RECENT_SETTLED_MS, inboxSections, inboxThreads, inboxSummary, nothingToDo, settleCandidates, unreadCount } from "../../../src/features/inbox/inbox.ts";
import { thread } from "../../fixtures.ts";

const now = new Date("2026-01-12T12:00:00.000Z");
const ask = { requestId: "r", kind: "command", category: "approval" as const };
const ids = (list: Array<{ id: string }>) => list.map((t) => t.id);
const fresh: SeenState = { since: "2026-01-01T00:00:00.000Z", seen: {} };
// Reads the thread at its current activity.
const readAt = (...threads: Array<{ id: string; lastActivityAt: string }>): SeenState => ({ since: fresh.since, seen: Object.fromEntries(threads.map((t) => [t.id, t.lastActivityAt])) });
const sectionsOf = (threads: ReturnType<typeof thread>[], seen = fresh, relaunch: ReadonlySet<string> = new Set()) => inboxSections(threads, seen, now, relaunch);

test("waiting threads and unsettled errors need you, whether read or not", () => {
  const wait = thread("wait", { status: "waiting", pending: ask });
  const err = thread("err", { status: "failed", lastError: "boom" });
  const s = sectionsOf([wait, err], readAt(wait, err));
  assert.deepEqual(new Set(ids(s.needsYou)), new Set(["wait", "err"]));
  assert.equal(s.unread.length + s.readIdle.length, 0);
});

test("unread finished threads are unread, read ones are read and idle", () => {
  const read = thread("read", { status: "completed" });
  const s = sectionsOf([thread("new", { status: "completed" }), thread("idle"), read], readAt(read));
  assert.deepEqual(new Set(ids(s.unread)), new Set(["new", "idle"]));
  assert.deepEqual(ids(s.readIdle), ["read"]);
});

test("a cancelled thread is a result, not an error", () => {
  const s = sectionsOf([thread("c", { status: "cancelled" })]);
  assert.deepEqual(ids(s.unread), ["c"]);
  assert.equal(s.needsYou.length, 0);
});

test("running threads go to running, even when settled", () => {
  const s = sectionsOf([thread("a", { settled: true, status: "running" })]);
  assert.deepEqual(ids(s.running), ["a"]);
  assert.equal(s.settled.length, 0);
});

test("a pending thread needs you even when settled", () => {
  const s = sectionsOf([thread("a", { settled: true, pending: ask, status: "waiting" })]);
  assert.deepEqual(ids(s.needsYou), ["a"]);
  assert.equal(s.settled.length, 0);
});

test("a settled error goes to settled, not to needs you", () => {
  const s = sectionsOf([thread("a", { settled: true, status: "failed", lastError: "x" })]);
  assert.equal(s.needsYou.length, 0);
  assert.deepEqual(ids(s.settled), ["a"]);
});

test("settled threads older than 3 days are dropped", () => {
  const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const s = sectionsOf([thread("fresh", { settled: true, lastActivityAt: at(RECENT_SETTLED_MS - 1000) }), thread("stale", { settled: true, lastActivityAt: at(RECENT_SETTLED_MS + 1000) })]);
  assert.deepEqual(ids(s.settled), ["fresh"]);
});

test("threads to relaunch leave read and idle", () => {
  const a = thread("a", { status: "completed" });
  const b = thread("b", { status: "completed" });
  const s = sectionsOf([a, b], readAt(a, b), new Set(["a"]));
  assert.deepEqual(ids(s.readIdle), ["b"]);
});

test("each section lists pinned threads first, then the most recent", () => {
  const s = sectionsOf([
    thread("old", { lastActivityAt: "2026-01-10T10:00:00.000Z" }),
    thread("new", { lastActivityAt: "2026-01-11T10:00:00.000Z" }),
    thread("pin", { pinned: true, lastActivityAt: "2026-01-09T10:00:00.000Z" }),
  ]);
  assert.deepEqual(ids(s.unread), ["pin", "new", "old"]);
});

test("settleCandidates keeps the read threads idle for more than 3 days", () => {
  const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const old = thread("old", { lastActivityAt: at(RECENT_SETTLED_MS + 1000) });
  const recent = thread("recent", { lastActivityAt: at(RECENT_SETTLED_MS - 1000) });
  assert.deepEqual(ids(settleCandidates([old, recent], now)), ["old"]);
});

test("unreadCount counts unread threads that need you or have an unread result", () => {
  const readWait = thread("w", { status: "waiting", pending: ask });
  const s = sectionsOf([readWait, thread("err", { status: "failed", lastError: "x" }), thread("new", { status: "completed" }), thread("run", { status: "running" })], readAt(readWait));
  assert.equal(unreadCount(s, readAt(readWait)), 2);
});

test("inboxSummary names the non-zero parts only", () => {
  assert.equal(inboxSummary(2, 3, 1), "2 need you · 3 unread · 1 to relaunch");
  assert.equal(inboxSummary(1, 1, 0), "1 needs you · 1 unread");
  assert.equal(inboxSummary(0, 0, 4), "4 to relaunch");
  assert.equal(inboxSummary(0, 0, 0), "");
});

test("nothingToDo ignores running, read and settled threads", () => {
  const quiet = sectionsOf([thread("run", { status: "running" }), thread("s", { settled: true })]);
  assert.equal(nothingToDo(quiet, 0, 0), true);
  assert.equal(nothingToDo(quiet, 1, 0), false);
  assert.equal(nothingToDo(quiet, 0, 1), false);
  assert.equal(nothingToDo(sectionsOf([thread("a")]), 0, 0), false);
});

test("inboxThreads leaves out hidden routine runs and setup threads", () => {
  const list = [thread("a"), thread("routine"), thread("setup")];
  assert.deepEqual(ids(inboxThreads(list, ["routine"], ["setup"])), ["a"]);
  assert.deepEqual(ids(inboxThreads(list)), ["a", "routine", "setup"]);
});
