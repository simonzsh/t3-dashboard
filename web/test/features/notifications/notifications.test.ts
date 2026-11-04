import { test } from "bun:test";
import assert from "node:assert/strict";
import { mergeSeen, type SeenState } from "../../../../shared/seen.ts";
import { badgeText, baselineOf, notifyEntries, NOTIFY_LIMIT, statusMap, transitions, unseenCount, unseenThreads } from "../../../src/features/notifications/notifications.ts";
import { thread } from "../../fixtures.ts";

const at = (minute: number) => `2026-01-10T10:${String(minute).padStart(2, "0")}:00.000Z`;
const finished = (id: string, minute: number, over = {}) => thread(id, { status: "completed", lastActivityAt: at(minute), ...over });
const waiting = (id: string, minute: number, category: "approval" | "user-input" | "other" = "approval") => thread(id, { status: "waiting", pending: { category }, lastActivityAt: at(minute) });
const running = (id: string) => thread(id, { status: "running", activeRunId: "run-1" });
const fresh: SeenState = { since: "", seen: {} };
const markSeen = (state: SeenState, id: string, when: string) => mergeSeen(state, { id, at: when })!;

test("waiting threads come first, then finished ones, newest first; working and idle are left out", () => {
  const entries = notifyEntries([finished("f-new", 30), waiting("w-old", 1), running("r"), thread("i"), finished("f-old", 5), waiting("w-new", 2)], fresh);
  assert.deepEqual(entries.map((e) => e.thread.id), ["w-new", "w-old", "f-new", "f-old"]);
  assert.deepEqual(entries.map((e) => e.kind), ["waiting", "waiting", "finished", "finished"]);
});

test("the list holds at most 20 entries", () => {
  const many = Array.from({ length: NOTIFY_LIMIT + 5 }, (_, i) => finished(`t${i}`, i));
  const entries = notifyEntries(many, fresh);
  assert.equal(entries.length, 20);
  assert.equal(entries[0]!.thread.id, "t24");
});

test("labels and tones tell what happened", () => {
  const label = (t: ReturnType<typeof thread>) => {
    const [e] = notifyEntries([t], fresh);
    return [e!.label, e!.tone];
  };
  assert.deepEqual(label(waiting("a", 1, "approval")), ["Needs approval", "waiting"]);
  assert.deepEqual(label(waiting("a", 1, "user-input")), ["Needs your input", "waiting"]);
  assert.deepEqual(label(waiting("a", 1, "other")), ["Waiting", "waiting"]);
  assert.deepEqual(label(finished("a", 1)), ["Finished", "done"]);
  assert.deepEqual(label(finished("a", 1, { status: "failed" })), ["Failed", "error"]);
  assert.deepEqual(label(finished("a", 1, { lastError: "boom" })), ["Failed", "error"]);
  assert.deepEqual(label(finished("a", 1, { status: "cancelled" })), ["Cancelled", "done"]);
});

test("waiting and finished threads count until they are read", () => {
  const threads = [waiting("w", 1), finished("f", 2)];
  assert.equal(unseenCount(threads, fresh), 2);
  const seen = markSeen(fresh, "f", at(2));
  assert.equal(unseenCount(threads, seen), 1);
  assert.deepEqual(notifyEntries(threads, seen).map((e) => e.unseen), [true, false]);
  const all = markSeen(seen, "w", at(1));
  assert.equal(unseenCount(threads, all), 0);
  assert.deepEqual(notifyEntries(threads, all).map((e) => e.unseen), [false, false]);
});

test("a waiting thread read before counts again after new activity", () => {
  const seen = markSeen(fresh, "w", at(1));
  assert.equal(unseenCount([waiting("w", 1)], seen), 0);
  assert.equal(unseenCount([waiting("w", 4)], seen), 1);
});

test("unseenThreads lists what Mark all as read marks: no working or idle thread", () => {
  const seen = markSeen(fresh, "f-read", at(3));
  const got = unseenThreads([waiting("w", 1), finished("f", 2), finished("f-read", 3), running("r"), thread("i")], seen);
  assert.deepEqual(got.map((t) => t.id), ["w", "f"]);
});

test("a thread that finishes again after it was opened counts again", () => {
  const seen = markSeen(fresh, "f", at(2));
  assert.equal(unseenCount([finished("f", 2)], seen), 0);
  assert.equal(unseenCount([finished("f", 9)], seen), 1);
});

test("history older than the baseline is listed but not counted", () => {
  const seen: SeenState = { since: at(10), seen: {} };
  const threads = [finished("old", 5), finished("new", 15)];
  assert.equal(unseenCount(threads, seen), 1);
  assert.equal(notifyEntries(threads, seen).find((e) => e.thread.id === "old")!.unseen, false);
});

test("the count covers every thread, not only the 20 listed", () => {
  const many = Array.from({ length: 30 }, (_, i) => finished(`t${i}`, i));
  assert.equal(unseenCount(many, fresh), 30);
});

test("the badge caps at 9+", () => {
  assert.equal(badgeText(3), "3");
  assert.equal(badgeText(9), "9");
  assert.equal(badgeText(10), "9+");
});

test("transitions: nothing on the first snapshot", () => {
  assert.deepEqual(transitions(null, [finished("f", 1), waiting("w", 2)]), []);
});

test("transitions: a run that ends, or a thread that starts waiting, makes a toast", () => {
  const prev = statusMap([running("a"), thread("b"), waiting("c", 1), running("d")]);
  const next = [finished("a", 5), waiting("b", 6), finished("c", 7), running("d")];
  const got = transitions(prev, next).map((e) => [e.thread.id, e.kind]);
  assert.deepEqual(got, [["a", "finished"], ["b", "waiting"], ["c", "finished"]]);
});

test("transitions: no toast for a status that did not change, an old finish or a new thread", () => {
  const prev = statusMap([finished("f", 1), waiting("w", 2), thread("i")]);
  assert.deepEqual(transitions(prev, [finished("f", 9), waiting("w", 9), finished("i", 3), finished("new", 4)]), []);
});

test("baselineOf is the newest activity, or now when there is none", () => {
  assert.equal(baselineOf([finished("a", 3), finished("b", 8), finished("c", 1)]), at(8));
  assert.ok(Math.abs(Date.parse(baselineOf([])) - Date.now()) < 5000);
});
