import assert from "node:assert/strict";
import { test } from "bun:test";
import { canScrollBy } from "../../src/ui/scrollLock.ts";

const box = (scrollTop: number, scrollLeft = 0) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400, scrollLeft, scrollWidth: 300, clientWidth: 300 });

test("a scroll inside a dialog stops at both ends instead of moving the page", () => {
  assert.equal(canScrollBy(box(0), 0, -10), false);
  assert.equal(canScrollBy(box(0), 0, 10), true);
  assert.equal(canScrollBy(box(300), 0, -10), true);
  assert.equal(canScrollBy(box(600), 0, 10), false);
});

test("a mostly sideways move checks the horizontal scroll", () => {
  assert.equal(canScrollBy(box(300), 10, 2), false);
  assert.equal(canScrollBy({ ...box(0), scrollWidth: 600 }, 10, 2), true);
});
