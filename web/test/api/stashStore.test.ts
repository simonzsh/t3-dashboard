import { test } from "bun:test";
import assert from "node:assert/strict";
import type { StashEntry } from "../../../shared/stash.ts";
import { applyEvent } from "../../src/api/events.ts";
import { ensureStash, setStash, staleStash } from "../../src/api/stashStore.ts";

const entry = { id: "e1" } as StashEntry;

test("the stash is read once for all composers", async () => {
  staleStash();
  let reads = 0;
  const load = async () => (reads++, [entry]);
  await Promise.all([ensureStash(load), ensureStash(load)]);
  await ensureStash(load);
  assert.equal(reads, 1);
});

test("a failed read can be tried again, and a stale stash is read again", async () => {
  staleStash();
  let reads = 0;
  await ensureStash(async () => (reads++, Promise.reject(new Error("down"))));
  await ensureStash(async () => (reads++, []));
  assert.equal(reads, 2);
  staleStash();
  await ensureStash(async () => (reads++, []));
  assert.equal(reads, 3);
  setStash([]);
});

const named = (id: string): StashEntry => ({ id, text: id, uploads: [], createdAt: "2026-11-04T10:00:00.000Z", threadId: "t", threadTitle: "T" });

test("a stash event leaves the dashboard state as it is", () => {
  assert.equal(applyEvent(null, { type: "stash", data: [named("a")] }), null);
});

test("setStash takes a list or an update, and tells every subscriber", () => {
  const seen: string[][] = [];
  setStash([named("a")]);
  setStash((list) => [named("b"), ...list]);
  // useStash reads the same list through useSyncExternalStore.
  setStash((list) => (seen.push(list.map((e) => e.id)), list));
  assert.deepEqual(seen, [["b", "a"]]);
  setStash([]);
});
