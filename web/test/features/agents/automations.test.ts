import { test } from "bun:test";
import assert from "node:assert/strict";
import type { Automation, DashboardThread } from "../../../../shared/api.ts";
import { excludeRoutineThreads, finishedSetups, setupThreads, lastRunState, nextLabel, reminderDate, splitAutomations } from "../../../src/features/agents/automations.ts";
import { thread } from "../../fixtures.ts";

function auto(id: string, over: Partial<Automation> = {}): Automation {
  return {
    id,
    kind: "routine",
    title: `Job ${id}`,
    projectId: "project-a",
    project: "Project A",
    scheduleLabel: "Daily 9:00",
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    threadId: null,
    model: null,
    ...over,
  };
}

// Local-time constructor: the labels use the browser's zone, so tests must not assume one.
const local = (m: number, d: number, h: number, min: number) => new Date(2026, m - 1, d, h, min);
const NOW = local(10, 25, 14, 0);

test("excludeRoutineThreads drops the hidden threads only", () => {
  const threads = [thread("t-hidden"), thread("t-chat"), thread("t-other")];
  assert.deepEqual(excludeRoutineThreads(threads, ["t-hidden", "t-gone"]).map((t) => t.id), ["t-chat", "t-other"]);
});

test("excludeRoutineThreads returns the same threads when nothing is hidden", () => {
  const threads = [thread("a"), thread("b")];
  assert.equal(excludeRoutineThreads(threads, []), threads);
});

test("splitAutomations sorts routines by next run (none last) and reminders by date", () => {
  const at = (id: string, when: string) => auto(id, { kind: "reminder", nextRunAt: when });
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

test("lastRunState reads the task's last run", () => {
  const lastRunAt = local(10, 25, 9, 40).toISOString();
  assert.deepEqual(lastRunState(auto("a", { lastRunStatus: "running" })), { kind: "running" });
  assert.deepEqual(lastRunState(auto("a", { lastRunStatus: "failed", lastRunError: "boom" })), { kind: "failed", error: "boom" });
  assert.deepEqual(lastRunState(auto("a", { lastRunStatus: "failed" })), { kind: "failed", error: null });
  assert.deepEqual(lastRunState(auto("a", { lastRunStatus: "succeeded", lastRunAt })), { kind: "done", at: "09:40" });
  assert.equal(lastRunState(auto("a", { lastRunStatus: "succeeded" })), null);
  assert.equal(lastRunState(auto("a")), null);
});

test("lastRunState says waiting when the thread is blocked on the user", () => {
  const pending = { requestId: "r", kind: "command", category: "approval" as const };
  const blocked = thread("t", { status: "waiting", pending });
  assert.deepEqual(lastRunState(auto("a", { lastRunStatus: "succeeded" }), blocked), { kind: "waiting" });
  assert.deepEqual(lastRunState(auto("a", { lastRunStatus: "running" }), thread("t", { status: "running" })), { kind: "running" });
});

test("lastRunState follows the thread after T3 sent the run", () => {
  const sent = auto("a", { lastRunStatus: "succeeded", lastRunAt: local(10, 25, 9, 40).toISOString() });
  assert.deepEqual(lastRunState(sent, thread("t", { status: "running" })), { kind: "running" });
  assert.deepEqual(lastRunState(sent, thread("t", { status: "failed", lastError: "turn failed" })), { kind: "failed", error: "turn failed" });
  assert.deepEqual(lastRunState(sent, thread("t", { status: "idle" })), { kind: "done", at: "09:40" });
});

test("nextLabel gives minutes, then a day word and a time", () => {
  assert.equal(nextLabel(null, NOW), "");
  assert.equal(nextLabel(local(10, 25, 14, 0).toISOString(), NOW), "now");
  assert.equal(nextLabel(local(10, 25, 13, 50).toISOString(), NOW), "now");
  assert.equal(nextLabel(local(10, 25, 14, 12).toISOString(), NOW), "in 12 min");
  assert.equal(nextLabel(local(10, 25, 14, 59).toISOString(), NOW), "in 59 min");
  assert.equal(nextLabel(local(10, 25, 18, 5).toISOString(), NOW), "today 18:05");
  assert.equal(nextLabel(local(10, 26, 9, 0).toISOString(), NOW), "tomorrow 9:00");
  assert.equal(nextLabel(local(10, 29, 18, 30).toISOString(), NOW), "Thu 18:30");
  assert.equal(nextLabel(local(11, 12, 7, 5).toISOString(), NOW), "Nov 12, 7:05");
});

test("reminderDate shows the day and time of the reminder", () => {
  assert.equal(reminderDate(local(10, 26, 9, 0).toISOString()), "Oct 26, 9:00");
});

test("setupThreads keeps the setup threads that are active or waiting, in the given order", () => {
  const threads = [
    thread("t-chat"),
    thread("t-run", { status: "running" }),
    thread("t-idle"),
    thread("t-ask", { pending: { category: "approval" } }),
  ];
  assert.deepEqual(setupThreads(threads, ["t-idle", "t-run", "t-ask", "t-gone"]).map((t) => t.id), ["t-run", "t-ask"]);
  assert.deepEqual(setupThreads(threads, []), []);
});

test("finishedSetups lists the setup threads that stopped being active", () => {
  const active = [thread("t-run", { status: "running" })];
  assert.deepEqual(finishedSetups(new Set(["t-run", "t-done"]), active), ["t-done"]);
  assert.deepEqual(finishedSetups(new Set(), active), []);
});
