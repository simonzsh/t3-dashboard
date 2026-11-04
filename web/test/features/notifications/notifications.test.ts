import { test } from "bun:test";
import assert from "node:assert/strict";
import { mergeSeen, type SeenState } from "../../../../shared/seen.ts";
import { badgeText, baselineOf, isUnseen, statusMap, transitions } from "../../../src/features/notifications/notifications.ts";
import { thread } from "../../fixtures.ts";

const at = (minute: number) => `2026-01-10T10:${String(minute).padStart(2, "0")}:00.000Z`;
const finished = (id: string, minute: number, over = {}) => thread(id, { status: "completed", lastActivityAt: at(minute), ...over });
const waiting = (id: string, minute: number, category: "approval" | "user-input" | "other" = "approval") => thread(id, { status: "waiting", pending: { category }, lastActivityAt: at(minute) });
const running = (id: string) => thread(id, { status: "running", activeRunId: "run-1" });
const fresh: SeenState = { since: "", seen: {} };
const markSeen = (state: SeenState, id: string, when: string) => mergeSeen(state, { id, at: when })!;

test("labels and tones tell what happened", () => {
  const label = (before: ReturnType<typeof thread>, after: ReturnType<typeof thread>) => {
    const [e] = transitions(statusMap([before]), [after]);
    return [e!.label, e!.tone];
  };
  const was = running("a");
  assert.deepEqual(label(thread("a"), waiting("a", 1, "approval")), ["Needs approval", "waiting"]);
  assert.deepEqual(label(thread("a"), waiting("a", 1, "user-input")), ["Needs your input", "waiting"]);
  assert.deepEqual(label(thread("a"), waiting("a", 1, "other")), ["Waiting", "waiting"]);
  assert.deepEqual(label(was, finished("a", 1)), ["Finished", "done"]);
  assert.deepEqual(label(was, finished("a", 1, { status: "failed" })), ["Failed", "error"]);
  assert.deepEqual(label(was, finished("a", 1, { lastError: "boom" })), ["Failed", "error"]);
  assert.deepEqual(label(was, finished("a", 1, { status: "cancelled" })), ["Cancelled", "done"]);
});

test("a thread is unseen until it is read, and again after new activity", () => {
  assert.equal(isUnseen(finished("f", 2), fresh), true);
  const seen = markSeen(fresh, "f", at(2));
  assert.equal(isUnseen(finished("f", 2), seen), false);
  assert.equal(isUnseen(finished("f", 9), seen), true);
});

test("history older than the baseline is not unseen", () => {
  const seen: SeenState = { since: at(10), seen: {} };
  assert.equal(isUnseen(finished("old", 5), seen), false);
  assert.equal(isUnseen(finished("new", 15), seen), true);
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
