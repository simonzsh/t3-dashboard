import assert from "node:assert/strict";
import { test } from "bun:test";
import { reminderSchedule, routineSchedule, webhookSchedule } from "../../src/domain/automationSchedule.ts";
import { DomainError } from "../../src/domain/errors.ts";

// Local-time dates: the code reads the local clock, like T3 does.
const now = new Date(2026, 10, 4, 10, 0, 0);
const at = (days: number, hours = 0, minutes = 0) => new Date(now.getTime() + ((days * 24 + hours) * 60 + minutes) * 60_000);

test("a routine interval is sent in milliseconds", () => {
  assert.deepEqual(routineSchedule({ type: "interval", everyMinutes: 15 }), { type: "interval", everyMs: 900_000 });
});

test("a fixed time sorts and dedups its weekdays, and drops them for every day", () => {
  assert.deepEqual(routineSchedule({ type: "fixed_time", timeOfDay: "09:00", weekdays: [5, 1, 1, 3] }), { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 3, 5] });
  assert.deepEqual(routineSchedule({ type: "fixed_time", timeOfDay: "09:00", weekdays: [] }), { type: "fixed_time", timeOfDay: "09:00" });
  assert.deepEqual(routineSchedule({ type: "fixed_time", timeOfDay: "09:00", weekdays: [0, 1, 2, 3, 4, 5, 6, 6] }), { type: "fixed_time", timeOfDay: "09:00" });
});

test("a reminder under 7 days is a fixed time on the right weekday", () => {
  const target = at(6, 23);
  assert.deepEqual(reminderSchedule(target, now), { type: "fixed_time", timeOfDay: "09:00", weekdays: [target.getDay()] });
  assert.deepEqual(reminderSchedule(at(0, 0, 5), now), { type: "fixed_time", timeOfDay: "10:05", weekdays: [now.getDay()] });
});

test("a reminder of 7 days or more is an interval of the exact delay", () => {
  assert.deepEqual(reminderSchedule(at(7), now), { type: "interval", everyMs: 7 * 86_400_000 });
  assert.deepEqual(reminderSchedule(at(30), now), { type: "interval", everyMs: 30 * 86_400_000 });
});

test("a reminder under a minute or past 366 days is refused", () => {
  for (const target of [at(0, 0, 0), new Date(now.getTime() + 59_000), at(-1), at(367)]) {
    assert.throws(() => reminderSchedule(target, now), (error) => error instanceof DomainError && error.code === "invalid");
  }
  assert.doesNotThrow(() => reminderSchedule(at(366), now));
  assert.doesNotThrow(() => reminderSchedule(new Date(now.getTime() + 60_000), now));
});

test("a webhook keeps its filters only when there are some, and its signature or null", () => {
  const signature = { header: "x-hub-signature-256", encoding: "hex" as const, prefix: "sha256=", secret: "s3cret" };
  const filter = { path: "headers.x-github-event", op: "equals" as const, value: "pull_request" };
  assert.deepEqual(webhookSchedule([], null), { type: "webhook", signature: null });
  assert.deepEqual(webhookSchedule([filter], signature), { type: "webhook", signature, filters: [filter] });
});
