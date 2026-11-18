import assert from "node:assert/strict";
import { test } from "bun:test";
import { impactSparks } from "../../../src/features/conversation/messageImpact.ts";

test("sparks start outside each side of the bubble and move away from it", () => {
  for (const [width, height] of [[60, 38], [640, 240]] as const) {
    const sparks = impactSparks(width, height);
    assert.equal(sparks.length, 14);
    assert(sparks.some(({ left, dx }) => left < 0 && dx < 0));
    assert(sparks.some(({ left, dx }) => left > width && dx > 0));
    assert(sparks.some(({ top, dy }) => top < 0 && dy < 0));
    assert(sparks.some(({ top, dy }) => top > height && dy > 0));
    assert(sparks.every(({ duration }) => duration < 450));
  }
});
