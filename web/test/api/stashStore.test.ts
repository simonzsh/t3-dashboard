import assert from "node:assert/strict";
import { test } from "bun:test";
import { applyEvent } from "../../src/api/events.ts";
import { setStash } from "../../src/api/stashStore.ts";
import type { StashEntry } from "../../../shared/stash.ts";

const entry = (id: string): StashEntry => ({ id, text: id, uploads: [], createdAt: "2026-11-04T10:00:00.000Z", threadId: "t", threadTitle: "T" });

test("a stash event leaves the dashboard state as it is", () => {
  const state = null;
  assert.equal(applyEvent(state, { type: "stash", data: [entry("a")] }), null);
});

test("setStash takes a list or an update, and tells every subscriber", () => {
  const seen: string[][] = [];
  setStash([entry("a")]);
  setStash((list) => [entry("b"), ...list]);
  // useStash reads the same list through useSyncExternalStore.
  setStash((list) => (seen.push(list.map((e) => e.id)), list));
  assert.deepEqual(seen, [["b", "a"]]);
  setStash([]);
});
