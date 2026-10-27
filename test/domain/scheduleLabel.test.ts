import assert from "node:assert/strict";
import { test } from "bun:test";
import { scheduleLabel } from "../../src/domain/scheduleLabel.ts";

const MIN = 60_000;

test("an interval reads in minutes, hours or days", () => {
  assert.equal(scheduleLabel({ type: "interval", everyMs: 15 * MIN }), "Every 15 min");
  assert.equal(scheduleLabel({ type: "interval", everyMs: 90 * MIN }), "Every 90 min");
  assert.equal(scheduleLabel({ type: "interval", everyMs: 120 * MIN }), "Every 2 h");
  assert.equal(scheduleLabel({ type: "interval", everyMs: 48 * 60 * MIN }), "Every 2 d");
});

test("a fixed time without weekdays is daily, with the hour unpadded", () => {
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "09:00" }), "Daily 9:00");
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "17:30", weekdays: null }), "Daily 17:30");
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "08:00", weekdays: [0, 1, 2, 3, 4, 5, 6] }), "Daily 8:00");
});

test("weekdays, weekends and day lists get short names", () => {
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "09:00", weekdays: [5, 4, 3, 2, 1] }), "Weekdays 9:00");
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "10:00", weekdays: [6, 0] }), "Weekends 10:00");
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "09:00", weekdays: [3, 1] }), "Mon, Wed 9:00");
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "17:00", weekdays: [0, 5] }), "Fri, Sun 17:00");
});

test("a webhook is labelled Webhook", () => {
  assert.equal(scheduleLabel({ type: "webhook" }), "Webhook");
});

test("a malformed or missing schedule gets a neutral label", () => {
  assert.equal(scheduleLabel(undefined), "Schedule");
  assert.equal(scheduleLabel({ type: "cron" }), "Schedule");
  assert.equal(scheduleLabel({ type: "interval" }), "Schedule");
  assert.equal(scheduleLabel({ type: "interval", everyMs: 0 }), "Schedule");
  assert.equal(scheduleLabel({ type: "fixed_time" }), "Schedule");
  assert.equal(scheduleLabel({ type: "fixed_time", timeOfDay: "soon" }), "Schedule");
});
