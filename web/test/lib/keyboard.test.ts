import assert from "node:assert/strict";
import { test } from "bun:test";
import { keyboardOpen } from "../../src/lib/keyboard.ts";

test("an on-screen keyboard is a large drop of the visible height, not a browser bar", () => {
  assert.equal(keyboardOpen(844, 508), true);
  assert.equal(keyboardOpen(844, 790), false);
  assert.equal(keyboardOpen(844, 844), false);
});
