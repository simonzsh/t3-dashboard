import assert from "node:assert/strict";
import { test } from "bun:test";
import { isNewer } from "../../src/config/version.ts";

test("isNewer compares numbers, not strings", () => {
  assert.equal(isNewer("v0.10.0", "0.9.9"), true);
  assert.equal(isNewer("1.0.0", "0.99.99"), true);
  assert.equal(isNewer("0.5.1", "0.5.0"), true);
  assert.equal(isNewer("0.5.0", "0.5.0"), false);
  assert.equal(isNewer("0.4.9", "0.5.0"), false);
});

test("a version that is not semver is never behind", () => {
  assert.equal(isNewer("9.9.9", "dev"), false);
  assert.equal(isNewer("garbage", "1.0.0"), false);
});
