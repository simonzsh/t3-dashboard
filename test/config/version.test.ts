import assert from "node:assert/strict";
import { test } from "bun:test";
import { isNewer, updateChannel } from "../../src/config/version.ts";

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

test("with equal numbers, a release beats its pre-release", () => {
  assert.equal(isNewer("1.0.0", "1.0.0-rc.1"), true);
  assert.equal(isNewer("1.0.0-rc.1", "1.0.0"), false);
  assert.equal(isNewer("1.0.0-rc.2", "1.0.0-rc.1"), false);
  assert.equal(isNewer("1.0.0+build.5", "1.0.0"), false);
  assert.equal(isNewer("1.0.0", "1.0.0+build.5"), false);
});

test("main versions follow a commit and can switch to and from stable", () => {
  const main = `main-${"a".repeat(40)}`;
  const next = `main-${"b".repeat(40)}`;
  assert.equal(isNewer(next, main), true);
  assert.equal(isNewer(main, main), false);
  assert.equal(isNewer(main, "1.2.8"), true);
  assert.equal(isNewer("1.2.8", main), true);
  assert.equal(isNewer(main, "dev"), false);
  assert.equal(isNewer("main-invalid", main), false);
  assert.equal(isNewer(main, "unknown"), false);
});

test("the update channel defaults to the binary and accepts an explicit override", () => {
  const main = `main-${"a".repeat(40)}`;
  assert.equal(updateChannel({}, "1.2.8"), "stable");
  assert.equal(updateChannel({}, main), "main");
  assert.equal(updateChannel({ T3_DASHBOARD_UPDATE_CHANNEL: "main" }, "1.2.8"), "main");
  assert.equal(updateChannel({ T3_DASHBOARD_UPDATE_CHANNEL: "stable" }, main), "stable");
  assert.throws(() => updateChannel({ T3_DASHBOARD_UPDATE_CHANNEL: "other" }, "1.2.8"), /must be stable or main/);
});
