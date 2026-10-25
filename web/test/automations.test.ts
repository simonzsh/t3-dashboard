import test from "node:test";
import assert from "node:assert/strict";
import type { Automation } from "../../shared/api.ts";
import { excludeRoutineThreads, lastRunState, nextLabel, reminderDate, splitAutomations } from "../src/automations.ts";
import { thread } from "./fixtures.ts";

function auto(id: string, over: Partial<Automation> = {}): Automation {
  return {
    id,
    brain: "Brain A",
    kind: "routine",
    title: `Job ${id}`,
    schedule: { kind: "cron", cron: "0 9 * * *", timeZone: "UTC", label: "tous les jours à 09:00" },
    nextRunAt: null,
    lastRunAt: null,
    threadId: null,
    model: null,
    ...over,
  };
}

// Local-time constructor: the labels use the browser's zone, so tests must not assume one.
const local = (m: number, d: number, h: number, min: number) => new Date(2026, m - 1, d, h, min);
const NOW = local(10, 25, 14, 0);

test("excludeRoutineThreads drops routine threads but keeps reminder targets", () => {
  const threads = [thread("t-routine"), thread("t-reminder"), thread("t-other")];
  const automations = [
    auto("r1", { threadId: "t-routine" }),
    auto("p1", { kind: "reminder", schedule: { kind: "once", at: "2026-10-26T09:00:00.000Z" }, threadId: "t-reminder" }),
    auto("r2"),
  ];
  assert.deepEqual(excludeRoutineThreads(threads, automations).map((t) => t.id), ["t-reminder", "t-other"]);
});

test("excludeRoutineThreads returns the same threads when there is no automation", () => {
  const threads = [thread("a"), thread("b")];
  assert.deepEqual(excludeRoutineThreads(threads, []), threads);
});

test("splitAutomations sorts routines by next run (none last) and reminders by date", () => {
  const at = (id: string, when: string) => auto(id, { kind: "reminder", schedule: { kind: "once", at: when }, nextRunAt: when });
  const { routines, reminders } = splitAutomations([
    auto("late", { nextRunAt: "2026-10-27T09:00:00.000Z" }),
    auto("none"),
    auto("soon", { nextRunAt: "2026-10-25T15:00:00.000Z" }),
    at("rem-2", "2026-10-30T09:00:00.000Z"),
    at("rem-1", "2026-10-26T09:00:00.000Z"),
  ]);
  assert.deepEqual(routines.map((a) => a.id), ["soon", "late", "none"]);
  assert.deepEqual(reminders.map((a) => a.id), ["rem-1", "rem-2"]);
});

test("lastRunState maps thread status to running, failed or done", () => {
  const done = local(10, 25, 9, 40).toISOString();
  assert.deepEqual(lastRunState(thread("t", { status: "running" })), { kind: "running" });
  assert.deepEqual(lastRunState(thread("t", { status: "failed" })), { kind: "failed" });
  assert.deepEqual(lastRunState(thread("t", { status: "completed", lastError: "boom" })), { kind: "failed" });
  assert.deepEqual(lastRunState(thread("t", { status: "completed", lastActivityAt: done })), { kind: "done", at: "09:40" });
  assert.deepEqual(lastRunState(thread("t", { status: "idle", lastActivityAt: done })), { kind: "done", at: "09:40" });
});

test("lastRunState is null without a thread", () => {
  assert.equal(lastRunState(undefined), null);
});

test("nextLabel gives minutes, then a day word and a time", () => {
  assert.equal(nextLabel(null, NOW), "");
  assert.equal(nextLabel(local(10, 25, 14, 0).toISOString(), NOW), "maintenant");
  assert.equal(nextLabel(local(10, 25, 13, 50).toISOString(), NOW), "maintenant");
  assert.equal(nextLabel(local(10, 25, 14, 12).toISOString(), NOW), "dans 12 min");
  assert.equal(nextLabel(local(10, 25, 14, 59).toISOString(), NOW), "dans 59 min");
  assert.equal(nextLabel(local(10, 25, 18, 5).toISOString(), NOW), "aujourd'hui 18:05");
  assert.equal(nextLabel(local(10, 26, 9, 0).toISOString(), NOW), "demain 9:00");
  assert.equal(nextLabel(local(10, 29, 18, 30).toISOString(), NOW), "jeu. 18:30");
  assert.equal(nextLabel(local(11, 12, 7, 5).toISOString(), NOW), "12 nov. 7:05");
});

test("reminderDate shows the day and time of the reminder", () => {
  assert.equal(reminderDate(local(10, 26, 9, 0).toISOString()), "26 oct. 9:00");
});
