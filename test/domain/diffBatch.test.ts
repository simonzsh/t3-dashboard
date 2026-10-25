import assert from "node:assert/strict";
import { test } from "bun:test";
import { DiffBatch } from "../../src/domain/diffBatch.ts";

const item = (id: string, title = id) => ({ id, title });

test("an empty batch gives nothing", () => {
  assert.equal(new DiffBatch().take(), null);
});

test("the last upsert of an id wins and take empties the batch", () => {
  const batch = new DiffBatch<{ id: string; title: string }>();
  batch.upsert(item("a", "first"));
  batch.merge({ upserted: [item("a", "second"), item("b")], removed: [] });
  assert.deepEqual(batch.take(), { upserted: [item("a", "second"), item("b")], removed: [] });
  assert.equal(batch.take(), null);
});

test("a removal cancels an earlier upsert, and an upsert cancels an earlier removal", () => {
  const batch = new DiffBatch<{ id: string; title: string }>();
  batch.upsert(item("a"));
  batch.remove("a");
  batch.remove("b");
  batch.merge({ upserted: [item("b")], removed: [] });
  assert.deepEqual(batch.take(), { upserted: [item("b")], removed: ["a"] });
});

test("clear drops every pending change", () => {
  const batch = new DiffBatch<{ id: string }>();
  batch.upsert({ id: "a" });
  batch.remove("b");
  batch.clear();
  assert.equal(batch.take(), null);
});
