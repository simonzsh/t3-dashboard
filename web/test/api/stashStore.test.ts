import { test } from "bun:test";
import assert from "node:assert/strict";
import type { StashEntry } from "../../../shared/stash.ts";
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
