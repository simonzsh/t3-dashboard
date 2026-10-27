import { test } from "bun:test";
import assert from "node:assert/strict";
import { swipeDirection } from "../../src/lib/swipe.ts";

test("a long horizontal drag is a swipe toward its side", () => {
  assert.equal(swipeDirection(-120, 10), "left");
  assert.equal(swipeDirection(120, -10), "right");
});

test("a tap or a short drag is not a swipe", () => {
  assert.equal(swipeDirection(0, 0), null);
  assert.equal(swipeDirection(-40, 0), null);
});

test("a mostly vertical drag scrolls the page instead", () => {
  assert.equal(swipeDirection(-80, 70), null);
  assert.equal(swipeDirection(90, -200), null);
});
