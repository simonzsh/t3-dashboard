import assert from "node:assert/strict";
import { test } from "bun:test";
import { nextActive } from "../../src/ui/useListNav.ts";

test("arrows wrap at both ends", () => {
  assert.equal(nextActive("ArrowDown", 2, 3), 0);
  assert.equal(nextActive("ArrowUp", 0, 3), 2);
  assert.equal(nextActive("ArrowDown", 0, 3), 1);
});

test("an arrow enters the list from nothing active", () => {
  assert.equal(nextActive("ArrowDown", -1, 3), 0);
  assert.equal(nextActive("ArrowUp", -1, 3), 2);
});

test("Home and End jump to the ends, and are ignored when turned off", () => {
  assert.equal(nextActive("Home", 2, 5), 0);
  assert.equal(nextActive("End", 1, 5), 4);
  assert.equal(nextActive("Home", 2, 5, false), null);
  assert.equal(nextActive("End", 2, 5, false), null);
});

test("an empty list has nothing active", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) assert.equal(nextActive(key, 0, 0), -1);
});

test("other keys are not list keys", () => {
  for (const key of ["Enter", " ", "a", "Escape", "Tab"]) assert.equal(nextActive(key, 1, 3), null);
});
