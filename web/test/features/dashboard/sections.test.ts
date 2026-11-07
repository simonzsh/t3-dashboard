import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SeenState } from "../../../../shared/seen.ts";
import { notificationDetail, notificationIcon, notificationList, splitRead, threadSections, attentionCount } from "../../../src/features/dashboard/sections.ts";
import { thread } from "../../fixtures.ts";

const now = new Date("2026-01-12T12:00:00.000Z");
const THREE_DAYS_MS = 3 * 24 * 3_600_000;
const ask = { requestId: "r", kind: "command", category: "approval" as const };
const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
const ids = (list: Array<{ id: string }>) => list.map((t) => t.id);
const fresh: SeenState = { since: "2026-01-01T00:00:00.000Z", seen: {} };
// Reads the thread at its current activity.
const readAt = (...threads: Array<{ id: string; lastActivityAt: string }>): SeenState => ({ since: fresh.since, seen: Object.fromEntries(threads.map((t) => [t.id, t.lastActivityAt])) });
const sectionsOf = (threads: ReturnType<typeof thread>[], seen = fresh) => threadSections(threads, seen);

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

test("running lists pinned threads first, then the most recent", () => {
  const s = sectionsOf([
    thread("old", { status: "running", lastActivityAt: "2026-01-10T10:00:00.000Z" }),
    thread("new", { status: "running", lastActivityAt: "2026-01-11T10:00:00.000Z" }),
    thread("pin", { status: "running", pinned: true, lastActivityAt: "2026-01-09T10:00:00.000Z" }),
  ]);
  assert.deepEqual(ids(s.running), ["pin", "new", "old"]);
});

test("splitRead cuts the read threads at 3 days", () => {
  const old = thread("old", { lastActivityAt: at(THREE_DAYS_MS + 1000) });
  const recent = thread("recent", { lastActivityAt: at(THREE_DAYS_MS - 1000) });
  const split = splitRead([old, recent], now);
  assert.deepEqual(ids(split.old), ["old"]);
  assert.deepEqual(ids(split.recent), ["recent"]);
});

test("attentionCount counts what needs you, read or not, and the unread results", () => {
  const readWait = thread("w", { status: "waiting", pending: ask });
  const s = sectionsOf([readWait, thread("err", { status: "failed", lastError: "x" }), thread("new", { status: "completed" }), thread("run", { status: "running" })], readAt(readWait));
  assert.equal(attentionCount(s), 3);
});

test("the notification list puts what needs you first, then unread, then recent read threads, newest first", () => {
  const readOld = thread("readOld", { status: "completed", lastActivityAt: at(THREE_DAYS_MS + 1000) });
  const readNew = thread("readNew", { status: "completed", lastActivityAt: at(1000) });
  const list = [
    thread("u1", { status: "completed", lastActivityAt: at(5000) }),
    thread("u2", { status: "completed", lastActivityAt: at(2000) }),
    thread("w", { status: "waiting", pending: ask, lastActivityAt: at(9000) }),
    readOld,
    readNew,
  ];
  const s = sectionsOf(list, readAt(readOld, readNew));
  assert.deepEqual(notificationList(s, splitRead(s.readIdle, now).recent).map((n) => `${n.kind}:${n.thread.id}`), ["needs:w", "unread:u2", "unread:u1", "read:readNew"]);
  assert.deepEqual(notificationList(s, s.readIdle).map((n) => n.thread.id), ["w", "u2", "u1", "readNew", "readOld"]);
});

test("a notification shows a warning when it waits, an alert on error, a check when done", () => {
  assert.deepEqual(notificationIcon(thread("a", { status: "waiting", pending: ask })), { icon: "user", tone: "warn" });
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
