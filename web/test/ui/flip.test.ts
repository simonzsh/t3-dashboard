import assert from "node:assert/strict";
import { test } from "bun:test";
import { fitInto, flipDelta, flipPlan, moved } from "../../src/ui/flip.ts";

test("the FLIP delta puts an element laid out at its new rect back on its old one", () => {
  const before = { left: 100, top: 50, width: 200, height: 100 };
  const after = { left: 300, top: 50, width: 400, height: 50 };
  assert.deepEqual(flipDelta(before, after), { x: -200, y: 0, sx: 0.5, sy: 2 });
});

test("a FLIP delta from a zero-size rect does not divide by zero", () => {
  const d = flipDelta({ left: 0, top: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 0, height: 0 });
  assert.equal(d.sx, 1);
  assert.equal(d.sy, 1);
});

test("a rect moved by less than a pixel does not count as moved", () => {
  const a = { left: 10, top: 10, width: 100, height: 100 };
  assert.equal(moved(a, { ...a, left: 10.4 }), false);
  assert.equal(moved(a, { ...a, width: 120 }), true);
  assert.equal(moved(a, { ...a, top: 12 }), true);
});

test("fitInto keeps the box shape and centers it in the target", () => {
  // A 300x100 box shrinks into a 60x30 target: the width decides (60/300 = 0.2), so 60x20.
  const box = { left: 0, top: 0, width: 300, height: 100 };
  const target = { left: 500, top: 10, width: 60, height: 30 };
  assert.deepEqual(fitInto(box, target), { left: 500, top: 15, width: 60, height: 20 });
});

test("fitInto lets the height decide for a flat target", () => {
  const box = { left: 0, top: 0, width: 400, height: 400 };
  const target = { left: 100, top: 700, width: 200, height: 20 };
  assert.deepEqual(fitInto(box, target), { left: 190, top: 700, width: 20, height: 20 });
});

test("flipPlan moves kept items, enters new ones and leaves removed ones", () => {
  assert.deepEqual(flipPlan(["a", "b", "c"], ["a", "c", "d"]), [
    { id: "a", kind: "move" },
    { id: "c", kind: "move" },
    { id: "d", kind: "enter" },
    { id: "b", kind: "leave" },
  ]);
});
