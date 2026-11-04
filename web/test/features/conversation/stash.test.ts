import assert from "node:assert/strict";
import { test } from "bun:test";
import { isStashKey, planRestore, stashShortcutLabel } from "../../../src/features/conversation/stash.ts";
import type { StashEntry } from "../../../../shared/stash.ts";

const key = { key: "s", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false };
const upload = (id: string) => ({ type: "file" as const, id, name: `${id}.txt`, mimeType: "text/plain", sizeBytes: 1 });
const entry = (uploads = [upload("a")]): StashEntry => ({ id: "e", text: "t", uploads, createdAt: "2026-11-04T10:00:00.000Z", threadId: "t", threadTitle: "T" });

test("isStashKey: Ctrl+S everywhere, Cmd+S on a Mac, never with Shift, Alt or IME", () => {
  assert.equal(isStashKey({ ...key, ctrlKey: true }, false), true);
  assert.equal(isStashKey({ ...key, key: "S", ctrlKey: true }, false), true);
  assert.equal(isStashKey({ ...key, metaKey: true }, false), false);
  assert.equal(isStashKey({ ...key, metaKey: true }, true), true);
  assert.equal(isStashKey({ ...key, ctrlKey: true }, true), true);
  assert.equal(isStashKey({ ...key, ctrlKey: true, metaKey: true }, true), false);
  assert.equal(isStashKey(key, false), false);
  assert.equal(isStashKey({ ...key, ctrlKey: true, shiftKey: true }, false), false);
  assert.equal(isStashKey({ ...key, ctrlKey: true, altKey: true }, false), false);
  assert.equal(isStashKey({ ...key, ctrlKey: true, isComposing: true }, false), false);
  assert.equal(isStashKey({ ...key, key: "k", ctrlKey: true }, false), false);
});

test("the shortcut label follows the platform", () => {
  assert.equal(stashShortcutLabel(true), "⌘S");
  assert.equal(stashShortcutLabel(false), "Ctrl+S");
});

test("a fresh entry restores all its uploads with no note", () => {
  assert.deepEqual(planRestore(entry(), 0, new Date("2026-11-04T12:00:00Z")), { uploads: [upload("a")], notes: [] });
});

test("an entry older than 24 hours restores its text only and names the dropped files", () => {
  const plan = planRestore(entry([upload("a"), upload("b")]), 0, new Date("2026-11-05T10:00:01Z"));
  assert.deepEqual(plan.uploads, []);
  assert.equal(plan.notes.length, 1);
  assert.match(plan.notes[0]!, /^a\.txt, b\.txt could not be restored: .*24 hours/);
});

test("uploads beyond the attachment limit are left out and named", () => {
  const plan = planRestore(entry([upload("a"), upload("b")]), 99, new Date("2026-11-04T12:00:00Z"));
  assert.deepEqual(plan.uploads, [upload("a")]);
  assert.match(plan.notes[0]!, /^b\.txt could not be restored: .*100-attachment limit/);
});
