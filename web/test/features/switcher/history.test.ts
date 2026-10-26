import { test } from "bun:test";
import assert from "node:assert/strict";
import { HISTORY_LIMIT, loadHistory, recordOpened, saveHistory } from "../../../src/features/switcher/history.ts";
import type { Store } from "../../../src/lib/storage.ts";

function memory(initial?: string): Store & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

test("recordOpened puts the id first, removes its older place and caps the list", () => {
  assert.deepEqual(recordOpened(["a", "b", "c"], "b"), ["b", "a", "c"]);
  const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => `t${i}`);
  const next = recordOpened(full, "new");
  assert.equal(next.length, HISTORY_LIMIT);
  assert.equal(next[0], "new");
  assert.equal(next.includes(`t${HISTORY_LIMIT - 1}`), false);
});

test("the history survives a save and a load", () => {
  const store = memory();
  saveHistory(store, ["a", "b"]);
  assert.deepEqual(loadHistory(store), ["a", "b"]);
});

test("a missing, broken or odd value loads as an empty or clean history", () => {
  assert.deepEqual(loadHistory(null), []);
  assert.deepEqual(loadHistory(memory()), []);
  assert.deepEqual(loadHistory(memory("{oops")), []);
  assert.deepEqual(loadHistory(memory('{"a":1}')), []);
  assert.deepEqual(loadHistory(memory('["a",3,"a","b"]')), ["a", "b"]);
});
