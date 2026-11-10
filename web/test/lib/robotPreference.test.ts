import { test } from "bun:test";
import assert from "node:assert/strict";
import { memoryStore } from "../fixtures.ts";
import { ROBOT_KEY, loadRobotVisibility, saveRobotVisibility } from "../../src/lib/robotPreference.ts";

test("the robot defaults to visible with missing, invalid or unavailable storage", () => {
  assert.equal(loadRobotVisibility(null), true);
  const store = memoryStore();
  assert.equal(loadRobotVisibility(store), true);
  store.setItem(ROBOT_KEY, "invalid");
  assert.equal(loadRobotVisibility(store), true);
  assert.equal(loadRobotVisibility({ getItem() { throw new Error("blocked"); }, setItem() {} }), true);
});

test("the robot visibility survives reloads in both directions", () => {
  const store = memoryStore();
  saveRobotVisibility(store, false);
  assert.equal(loadRobotVisibility(store), false);
  saveRobotVisibility(store, true);
  assert.equal(loadRobotVisibility(store), true);
});
