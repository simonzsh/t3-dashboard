import { test } from "bun:test";
import assert from "node:assert/strict";
import { isObject, uniqueStrings } from "../../shared/guards.ts";

test("isObject accepts plain objects only", () => {
  assert.equal(isObject({}), true);
  for (const value of [null, [], "x", 1, undefined]) assert.equal(isObject(value), false, String(value));
});

test("uniqueStrings keeps strings once in order, capped, and [] for a non-array", () => {
  assert.deepEqual(uniqueStrings(["a", 1, "b", "a", "c"]), ["a", "b", "c"]);
  assert.deepEqual(uniqueStrings(["a", "b", "c"], 2), ["a", "b"]);
  assert.deepEqual(uniqueStrings("a"), []);
  assert.deepEqual(uniqueStrings(null), []);
});
