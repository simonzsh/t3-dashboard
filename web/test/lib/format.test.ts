import { test } from "bun:test";
import assert from "node:assert/strict";
import { STEP_LABELS, duration, errorMessage, relativeTime } from "../../src/lib/format.ts";

const now = new Date("2026-03-01T12:00:00Z");

test("relativeTime picks the unit", () => {
  assert.equal(relativeTime("2026-03-01T11:59:40Z", now), "just now");
  assert.equal(relativeTime("2026-03-01T11:15:00Z", now), "45 min ago");
  assert.equal(relativeTime("2026-03-01T07:00:00Z", now), "5 h ago");
  assert.equal(relativeTime("2026-02-26T12:00:00Z", now), "3 d ago");
});

test("duration gives seconds, then minutes, then hours", () => {
  assert.equal(duration(0), "0s");
  assert.equal(duration(-5_000), "0s");
  assert.equal(duration(12_400), "12s");
  assert.equal(duration(185_000), "3m 05s");
  assert.equal(duration(3_720_000), "1h 02m");
});

test("errorMessage gives the message of an Error, or the value as text", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage("plain"), "plain");
  assert.equal(errorMessage(404), "404");
});

test("STEP_LABELS names each step status", () => {
  assert.deepEqual(STEP_LABELS, { running: "Running", done: "Done", failed: "Failed" });
});
