import assert from "node:assert/strict";
import { test } from "bun:test";
import type { SeenState } from "../../shared/seen.ts";
import { SeenStore } from "../../src/domain/seenStore.ts";

test("a change is saved and returned; one that changes nothing is not saved", () => {
  const saved: SeenState[] = [];
  const store = new SeenStore(null, (s) => void saved.push(s));
  assert.equal(store.apply({ id: "a", at: "2026-01-02T00:00:00Z" }), null);
  const base = store.apply({ since: "2026-01-01T00:00:00Z" });
  assert.deepEqual(base, { since: "2026-01-01T00:00:00Z", seen: {} });
  assert.equal(store.apply({ since: "2026-02-01T00:00:00Z" }), null);
  const marked = store.apply({ id: "a", at: "2026-01-02T00:00:00Z" });
  assert.deepEqual(store.get(), marked);
  assert.deepEqual(saved, [base, marked]);
});

test("a failed save keeps the previous state", () => {
  const store = new SeenStore({ since: "2026-01-01T00:00:00Z", seen: {} }, () => {
    throw new Error("disk full");
  });
  assert.throws(() => store.apply({ id: "a", at: "2026-01-02T00:00:00Z" }));
  assert.deepEqual(store.get(), { since: "2026-01-01T00:00:00Z", seen: {} });
});
