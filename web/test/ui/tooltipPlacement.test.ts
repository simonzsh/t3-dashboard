import assert from "node:assert/strict";
import { test } from "bun:test";
import { placeTooltip } from "../../src/ui/tooltipPlacement.ts";

const viewport = { width: 800, height: 600 };
const tip = { width: 100, height: 24 };

test("a tooltip sits centered above its anchor", () => {
  const anchor = { left: 300, top: 200, width: 40, height: 30 };
  assert.deepEqual(placeTooltip(anchor, tip, viewport), { left: 270, top: 168 });
});

test("a tooltip goes below when the top has no room", () => {
  const anchor = { left: 300, top: 10, width: 40, height: 30 };
  assert.deepEqual(placeTooltip(anchor, tip, viewport), { left: 270, top: 48 });
});

test("a tooltip stays inside the left and right edges", () => {
  assert.equal(placeTooltip({ left: 0, top: 200, width: 20, height: 20 }, tip, viewport).left, 4);
  assert.equal(placeTooltip({ left: 790, top: 200, width: 10, height: 20 }, tip, viewport).left, 696);
});
