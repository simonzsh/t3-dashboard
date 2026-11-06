import { afterEach, test } from "bun:test";
import assert from "node:assert/strict";
import { browserStorage, readJson, readKey, writeKey } from "../../src/lib/storage.ts";
import { memoryStore } from "../fixtures.ts";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test("browserStorage returns null when reading the localStorage global throws", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  assert.equal(browserStorage(), null);
});

test("readKey and writeKey read and write a store", () => {
  const store = memoryStore();
  assert.equal(readKey(store, "k"), null);
  writeKey(store, "k", "v");
  assert.equal(readKey(store, "k"), "v");
});

test("without a working storage a read finds nothing and a write does not throw", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  for (const storage of [blocked, null]) {
    assert.equal(readKey(storage, "k"), null);
    assert.doesNotThrow(() => writeKey(storage, "k", "v"));
  }
});

test("readJson parses a key and gives null when it is missing or broken", () => {
  const store = memoryStore({ ok: '{"a":[1]}', broken: "{oops" });
  assert.deepEqual(readJson(store, "ok"), { a: [1] });
  assert.equal(readJson(store, "broken"), null);
  assert.equal(readJson(store, "missing"), null);
  assert.equal(readJson(null, "ok"), null);
});
