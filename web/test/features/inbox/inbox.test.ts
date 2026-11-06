import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SeenState } from "../../../../shared/seen.ts";
import { RECENT_SETTLED_MS, inboxSections, inboxThreads, notificationDetail, notificationIcon, notificationList, recentRead, settleCandidates, unreadCount } from "../../../src/features/inbox/inbox.ts";
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
});

test("a pending thread needs you even when settled", () => {
  const s = sectionsOf([thread("a", { settled: true, pending: ask, status: "waiting" })]);
  assert.deepEqual(ids(s.needsYou), ["a"]);
});

test("a settled thread that does not run or wait is left out", () => {
  const s = sectionsOf([thread("a", { settled: true, status: "failed", lastError: "x" }), thread("b", { settled: true, status: "completed" })]);
  assert.deepEqual([...s.needsYou, ...s.unread, ...s.readIdle, ...s.running], []);
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

const at = (ms: number) => new Date(now.getTime() - ms).toISOString();

test("the notification list puts what needs you first, then unread, then recent read threads, newest first", () => {
  const readOld = thread("readOld", { status: "completed", lastActivityAt: at(RECENT_SETTLED_MS + 1000) });
  const readNew = thread("readNew", { status: "completed", lastActivityAt: at(1000) });
  const list = [
    thread("u1", { status: "completed", lastActivityAt: at(5000) }),
    thread("u2", { status: "completed", lastActivityAt: at(2000) }),
    thread("w", { status: "waiting", pending: ask, lastActivityAt: at(9000) }),
    readOld,
    readNew,
  ];
  const s = sectionsOf(list, readAt(readOld, readNew));
  assert.deepEqual(notificationList(s, now, false).map((n) => `${n.kind}:${n.thread.id}`), ["needs:w", "unread:u2", "unread:u1", "read:readNew"]);
  assert.deepEqual(notificationList(s, now, true).map((n) => n.thread.id), ["w", "u2", "u1", "readNew", "readOld"]);
  assert.deepEqual(ids(recentRead(s.readIdle, now)), ["readNew"]);
});

test("a notification shows a warning when it waits, an alert on error, a check when done", () => {
  assert.deepEqual(notificationIcon(thread("a", { status: "waiting", pending: ask })), { icon: "alertTriangle", tone: "warn" });
  assert.deepEqual(notificationIcon(thread("b", { status: "failed", lastError: "x" })), { icon: "alert", tone: "err" });
  assert.deepEqual(notificationIcon(thread("c", { status: "completed" })), { icon: "circleCheck", tone: "ok" });
  assert.deepEqual(notificationIcon(thread("d", { status: "idle" })), { icon: "info", tone: "info" });
});

test("the detail line says what the agent waits for, the error, or the model", () => {
  assert.equal(notificationDetail(thread("a", { status: "waiting", pending: ask }), null), "Waiting for your approval");
  assert.equal(notificationDetail(thread("b", { status: "failed", lastError: "Disk full" }), "M"), "Disk full");
  assert.equal(notificationDetail(thread("b2", { status: "failed" }), null), "The run failed");
  assert.equal(notificationDetail(thread("c", { status: "completed" }), "Model X"), "Finished · Model X");
  assert.equal(notificationDetail(thread("d", { status: "completed" }), null), "Finished");
});

test("inboxThreads leaves out hidden routine runs and setup threads", () => {
  const list = [thread("a"), thread("routine"), thread("setup")];
  assert.deepEqual(ids(inboxThreads(list, ["routine"], ["setup"])), ["a"]);
  assert.deepEqual(ids(inboxThreads(list)), ["a", "routine", "setup"]);
});
