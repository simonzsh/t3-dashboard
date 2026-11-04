import assert from "node:assert/strict";
import { test } from "bun:test";
import { StashStore } from "../../src/domain/stashStore.ts";
import { STASH_LIMIT, type StashBody, type StashEntry } from "../../shared/stash.ts";

const body = (text: string): StashBody => ({ text, uploads: [], threadId: "t-1", threadTitle: "Thread" });

function make(entries: StashEntry[] = []) {
  const saved: StashEntry[][] = [];
  let n = 0;
  const store = new StashStore(entries, (list) => void saved.push(list), { now: () => new Date("2026-11-04T10:00:00Z"), newId: () => `id-${++n}` });
  return { store, saved };
}

test("add puts the newest entry first and saves the list", () => {
  const { store, saved } = make();
  store.add(body("one"));
  const { entry } = store.add(body("two"));
  assert.deepEqual(entry, { id: "id-2", text: "two", uploads: [], createdAt: "2026-11-04T10:00:00.000Z", threadId: "t-1", threadTitle: "Thread" });
  assert.deepEqual(store.list().map((e) => e.text), ["two", "one"]);
  assert.deepEqual(saved.at(-1), store.list());
});

test("the 21st entry pushes the oldest one out and returns it", () => {
  const { store } = make();
  for (let i = 1; i <= STASH_LIMIT; i++) store.add(body(`m${i}`));
  const { evicted } = store.add(body("m21"));
  assert.deepEqual(evicted.map((e) => e.text), ["m1"]);
  assert.equal(store.list().length, STASH_LIMIT);
  assert.equal(store.list().at(-1)!.text, "m2");
});

test("remove returns the entry once, and null when it is gone", () => {
  const { store, saved } = make();
  const { entry } = store.add(body("a"));
  assert.equal(store.remove(entry.id)?.text, "a");
  assert.deepEqual(store.list(), []);
  assert.deepEqual(saved.at(-1), []);
  assert.equal(store.remove(entry.id), null);
});

test("a failed save leaves the list as it was", () => {
  const store = new StashStore([], () => { throw new Error("disk full"); }, { now: () => new Date(), newId: () => "x" });
  assert.throws(() => store.add(body("a")), /disk full/);
  assert.deepEqual(store.list(), []);
});
