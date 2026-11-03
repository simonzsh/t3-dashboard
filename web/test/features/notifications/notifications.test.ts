import { test } from "bun:test";
import assert from "node:assert/strict";
import { badgeText, loadSeen, markSeen, notifyEntries, NOTIFY_LIMIT, saveSeen, statusMap, transitions, unseenCount, type SeenState } from "../../../src/features/notifications/notifications.ts";
import { memoryStore, thread } from "../../fixtures.ts";

const KEY = "t3-dashboard-notifications-seen";
const at = (minute: number) => `2026-01-10T10:${String(minute).padStart(2, "0")}:00.000Z`;
const finished = (id: string, minute: number, over = {}) => thread(id, { status: "completed", lastActivityAt: at(minute), ...over });
const waiting = (id: string, minute: number, category: "approval" | "user-input" | "other" = "approval") => thread(id, { status: "waiting", pending: { category }, lastActivityAt: at(minute) });
const running = (id: string) => thread(id, { status: "running", activeRunId: "run-1" });
const fresh: SeenState = { since: "", seen: {} };

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

test("a waiting thread always counts; a finished one counts until it is opened", () => {
  const threads = [waiting("w", 1), finished("f", 2)];
  assert.equal(unseenCount(threads, fresh), 2);
  const seen = markSeen(markSeen(fresh, "f", at(2)), "w", at(1));
  assert.equal(unseenCount(threads, seen), 1);
  assert.deepEqual(notifyEntries(threads, seen).map((e) => e.unseen), [true, false]);
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

test("loadSeen: first use starts at the newest activity and is stored once", () => {
  const store = memoryStore();
  const seen = loadSeen(store, [finished("a", 3), finished("b", 8)]);
  assert.deepEqual(seen, { since: at(8), seen: {} });
  assert.equal(JSON.parse(store.data.get(KEY)!).since, at(8));
  assert.equal(loadSeen(store, [finished("c", 50)]).since, at(8));
});

test("loadSeen: bad JSON or blocked storage gives a fresh state", () => {
  for (const bad of ["{oops", "42", '{"since":3}']) {
    assert.deepEqual(loadSeen(memoryStore({ [KEY]: bad }), [finished("a", 3)]).seen, {});
  }
  assert.deepEqual(loadSeen(null, [finished("a", 3)]), { since: at(3), seen: {} });
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
  assert.doesNotThrow(() => saveSeen(throwing, fresh));
  assert.equal(loadSeen(throwing, []).seen && Object.keys(loadSeen(throwing, []).seen).length, 0);
});

test("saveSeen drops marks the baseline already hides and keeps the 200 newest", () => {
  const store = memoryStore();
  const seen: Record<string, string> = { stale: at(1) };
  for (let i = 0; i < 250; i++) seen[`t${i}`] = new Date(Date.UTC(2026, 0, 11, 0, 0, i)).toISOString();
  saveSeen(store, { since: at(5), seen });
  const saved = JSON.parse(store.data.get(KEY)!);
  const ids = Object.keys(saved.seen);
  assert.equal(ids.length, 200);
  assert.ok(!ids.includes("stale"));
  assert.ok(ids.includes("t249"));
  assert.ok(!ids.includes("t0"));
});
