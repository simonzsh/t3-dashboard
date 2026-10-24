import test from "node:test";
import assert from "node:assert/strict";
import { cut, relativeTime } from "../src/format.ts";

const now = new Date("2026-03-01T12:00:00Z");

test("relativeTime picks the unit", () => {
  assert.equal(relativeTime("2026-03-01T11:59:40Z", now), "à l'instant");
  assert.equal(relativeTime("2026-03-01T11:15:00Z", now), "il y a 45 min");
  assert.equal(relativeTime("2026-03-01T07:00:00Z", now), "il y a 5 h");
  assert.equal(relativeTime("2026-02-26T12:00:00Z", now), "il y a 3 j");
});

test("cut adds an ellipsis only when needed", () => {
  assert.equal(cut("abcdef", 6), "abcdef");
  assert.equal(cut("abcdefg", 6), "abcdef…");
});
