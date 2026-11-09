import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SeenState } from "../../../../shared/seen.ts";
import { notificationDetail, notificationIcon, notificationList, threadSections, attentionCount } from "../../../src/features/dashboard/sections.ts";
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

test("settled results stay visible with their read state", () => {
  const done = thread("done", { settled: true, status: "completed" });
  const failed = thread("failed", { settled: true, status: "failed", lastError: "x" });
  const s = sectionsOf([done, failed], readAt(failed));
  assert.deepEqual(ids(s.unread), ["done"]);
  assert.deepEqual(ids(s.readIdle), ["failed"]);
  assert.deepEqual(s.needsYou, []);
});

test("running lists pinned threads first, then the most recent", () => {
  const s = sectionsOf([
    thread("old", { status: "running", lastActivityAt: "2026-01-10T10:00:00.000Z" }),
    thread("new", { status: "running", lastActivityAt: "2026-01-11T10:00:00.000Z" }),
    thread("pin", { status: "running", pinned: true, lastActivityAt: "2026-01-09T10:00:00.000Z" }),
  ]);
  assert.deepEqual(ids(s.running), ["pin", "new", "old"]);
});


test("attentionCount counts what needs you, read or not, and the unread results", () => {
  const readWait = thread("w", { status: "waiting", pending: ask });
  const s = sectionsOf([readWait, thread("err", { status: "failed", lastError: "x" }), thread("new", { status: "completed" }), thread("run", { status: "running" })], readAt(readWait));
  assert.equal(attentionCount(s), 3);
});

test("notifications are chronological and include old read threads", () => {
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
  assert.deepEqual(notificationList(s).map((n) => `${n.kind}:${n.thread.id}`), ["read:readNew", "unread:u2", "unread:u1", "needs:w", "read:readOld"]);
});

test("a notification shows a warning when it waits, an alert on error, a check when done", () => {
  assert.deepEqual(notificationIcon(thread("a", { status: "waiting", pending: ask })), { icon: "user", tone: "warn" });
  assert.deepEqual(notificationIcon(thread("b", { status: "failed", lastError: "x" })), { icon: "alert", tone: "err" });
  assert.deepEqual(notificationIcon(thread("c", { status: "completed" })), { icon: "circleCheck", tone: "ok" });
  assert.deepEqual(notificationIcon(thread("d", { status: "idle" })), { icon: "info", tone: "info" });
});

test("the detail line says what the agent waits for, the error, or the model", () => {
  assert.equal(notificationDetail(thread("a", { status: "waiting", pending: ask })), "Waiting for your approval");
  assert.equal(notificationDetail(thread("b", { status: "failed", lastError: "Disk full" })), "Disk full");
  assert.equal(notificationDetail(thread("b2", { status: "failed" })), "The run failed");
  assert.equal(notificationDetail(thread("c", { status: "completed" })), "Finished");
  assert.equal(notificationDetail(thread("d", { status: "completed" })), "Finished");
});

test("notifications keep the latest 50 across groups without limiting running threads", () => {
  const threads = Array.from({ length: 60 }, (_, i) => thread(String(i), {
    lastActivityAt: at(i * 1000),
    settled: i % 2 === 0,
    ...(i % 3 === 0 ? { pending: ask } : {}),
  }));
  const seen = readAt(...threads.filter((_, i) => i % 3 === 1));
  const s = sectionsOf([...threads, thread("running", { status: "running" })], seen);
  const notifications = notificationList(s);
  assert.equal(notifications.length, 50);
  assert.deepEqual(new Set(notifications.map((n) => n.thread.id)), new Set(threads.slice(0, 50).map((t) => t.id)));
  assert.deepEqual(ids(s.running), ["running"]);
  assert.equal(attentionCount(s), s.needsYou.length + s.unread.length);
});

test("a new notification displaces the oldest of the retained 50", () => {
  const threads = Array.from({ length: 50 }, (_, i) => thread(String(i), {
    status: "completed", settled: i % 2 === 0, lastActivityAt: at((i + 1) * 1000),
  }));
  const before = notificationList(sectionsOf(threads));
  assert.equal(before.length, 50);
  assert.equal(before.at(-1)?.thread.id, "49");
  const after = notificationList(sectionsOf([...threads, thread("incoming", { status: "completed", lastActivityAt: at(0) })]));
  assert.equal(after.length, 50);
  assert.equal(after[0]?.thread.id, "incoming");
  assert.ok(!after.some((item) => item.thread.id === "49"));
});
