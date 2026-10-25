import { test } from "bun:test";
import assert from "node:assert/strict";
import { cut, duration, relativeTime } from "../src/format.ts";

const now = new Date("2026-03-01T12:00:00Z");

test("relativeTime picks the unit", () => {
  assert.equal(relativeTime("2026-03-01T11:59:40Z", now), "just now");
  assert.equal(relativeTime("2026-03-01T11:15:00Z", now), "45 min ago");
  assert.equal(relativeTime("2026-03-01T07:00:00Z", now), "5 h ago");
  assert.equal(relativeTime("2026-02-26T12:00:00Z", now), "3 d ago");
});

test("cut adds an ellipsis only when needed", () => {
  assert.equal(cut("abcdef", 6), "abcdef");
  assert.equal(cut("abcdefg", 6), "abcdef…");
});

test("duration gives seconds, then minutes, then hours", () => {
  assert.equal(duration(0), "0s");
  assert.equal(duration(-5_000), "0s");
  assert.equal(duration(12_400), "12s");
  assert.equal(duration(185_000), "3m 05s");
  assert.equal(duration(3_720_000), "1h 02m");
});
