import { test } from "bun:test";
import assert from "node:assert/strict";
import type { Automation, DashboardThread } from "../../../../shared/api.ts";
import { automationGroup, automationProjects, copyableUrl, excludeRoutineThreads, filterAutomations, finishedSetups, groupAutomations, isFinishedReminder, lastRunState, nextLabel, reminderDate, scheduleText, setupThreads } from "../../../src/features/automations/automations.ts";
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
    webhook: null,
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

test("isFinishedReminder needs a disabled reminder that ran", () => {
  const lastRunAt = "2026-10-24T09:00:00.000Z";
  assert.equal(isFinishedReminder(auto("a", { kind: "reminder", enabled: false, lastRunAt })), true);
  assert.equal(isFinishedReminder(auto("a", { kind: "reminder", enabled: false })), false);
  assert.equal(isFinishedReminder(auto("a", { kind: "reminder", lastRunAt })), false);
  assert.equal(isFinishedReminder(auto("a", { enabled: false, lastRunAt })), false);
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

const hook = (id: string, over: Partial<Automation> = {}) => auto(id, { kind: "webhook", webhook: { url: null, signed: true }, ...over });

test("copyableUrl gives the URL of a webhook only", () => {
  const url = "https://relay.example.invalid/v1/hooks/k/t/token";
  assert.equal(copyableUrl(hook("a", { webhook: { url, signed: true } })), url);
  assert.equal(copyableUrl(hook("b", { webhook: { url: null, signed: false } })), null);
  assert.equal(copyableUrl(auto("c")), null);
});

const waitingThread = thread("t-wait", { status: "waiting", pending: { category: "approval" } });
const tomorrow9 = local(10, 26, 9, 0).toISOString();

test("automationGroup: a failed or waiting last run needs attention, even when paused", () => {
  assert.equal(automationGroup(auto("a", { lastRunStatus: "failed" }), undefined, NOW), "attention");
  assert.equal(automationGroup(auto("a", { enabled: false, lastRunStatus: "failed" }), undefined, NOW), "attention");
  assert.equal(automationGroup(auto("a", { nextRunAt: tomorrow9 }), waitingThread, NOW), "attention");
});

test("automationGroup: paused and finished reminders are inactive", () => {
  assert.equal(automationGroup(auto("a", { enabled: false }), undefined, NOW), "inactive");
  const done = auto("r", { kind: "reminder", enabled: false, lastRunAt: local(10, 24, 9, 0).toISOString(), lastRunStatus: "succeeded" });
  assert.equal(automationGroup(done, undefined, NOW), "inactive");
});

test("automationGroup: running, or due before tomorrow's local midnight, is today", () => {
  assert.equal(automationGroup(auto("a", { lastRunStatus: "running", nextRunAt: local(11, 5, 9, 0).toISOString() }), undefined, NOW), "today");
  assert.equal(automationGroup(auto("a", { nextRunAt: local(10, 25, 23, 59).toISOString() }), undefined, NOW), "today");
  assert.equal(automationGroup(auto("a", { nextRunAt: local(10, 26, 0, 0).toISOString() }), undefined, NOW), "upcoming");
});

test("automationGroup: enabled webhooks and tasks without a next run are upcoming", () => {
  assert.equal(automationGroup(hook("h"), undefined, NOW), "upcoming");
  assert.equal(automationGroup(auto("a"), undefined, NOW), "upcoming");
});

test("groupAutomations sorts today and upcoming by next run (none last), attention and inactive by last run", () => {
  const groups = groupAutomations(
    [
      auto("up-none"),
      auto("up-late", { nextRunAt: local(10, 30, 9, 0).toISOString() }),
      auto("up-soon", { nextRunAt: tomorrow9 }),
      auto("today-2", { nextRunAt: local(10, 25, 20, 0).toISOString() }),
      auto("today-1", { nextRunAt: local(10, 25, 15, 0).toISOString() }),
      auto("fail-old", { lastRunStatus: "failed", lastRunAt: local(10, 20, 9, 0).toISOString() }),
      auto("fail-new", { lastRunStatus: "failed", lastRunAt: local(10, 24, 9, 0).toISOString() }),
      auto("off-old", { enabled: false, lastRunAt: local(10, 1, 9, 0).toISOString() }),
      auto("off-new", { enabled: false, lastRunAt: local(10, 2, 9, 0).toISOString() }),
    ],
    new Map(),
    NOW,
  );
  const ids = (list: Automation[]) => list.map((a) => a.id);
  assert.deepEqual(ids(groups.today), ["today-1", "today-2"]);
  assert.deepEqual(ids(groups.upcoming), ["up-soon", "up-late", "up-none"]);
  assert.deepEqual(ids(groups.attention), ["fail-new", "fail-old"]);
  assert.deepEqual(ids(groups.inactive), ["off-new", "off-old"]);
});

test("groupAutomations reads the thread of each automation", () => {
  const groups = groupAutomations([auto("a", { threadId: "t-wait" }), auto("b")], new Map([["t-wait", waitingThread]]), NOW);
  assert.deepEqual(groups.attention.map((a) => a.id), ["a"]);
});

test("filterAutomations matches title, project name and schedule, ignoring case and outer spaces", () => {
  const list = [auto("a", { title: "Nightly Backup", project: "Alpha", scheduleLabel: "Daily 2:00", projectId: "pa" }), auto("b", { title: "Report", project: "Beta", scheduleLabel: "Weekly Mon", projectId: "pb" })];
  const ids = (f: { projectId: string; query: string }) => filterAutomations(list, f).map((a) => a.id);
  assert.deepEqual(ids({ projectId: "", query: "" }), ["a", "b"]);
  assert.deepEqual(ids({ projectId: "", query: "  backup " }), ["a"]);
  assert.deepEqual(ids({ projectId: "", query: "BETA" }), ["b"]);
  assert.deepEqual(ids({ projectId: "", query: "weekly" }), ["b"]);
  assert.deepEqual(ids({ projectId: "pa", query: "" }), ["a"]);
  assert.deepEqual(ids({ projectId: "pa", query: "report" }), []);
});

test("automationProjects lists each project once, sorted by title", () => {
  const list = [auto("a", { projectId: "p2", project: "Zeta" }), auto("b", { projectId: "p1", project: "Alpha" }), auto("c", { projectId: "p2", project: "Zeta" })];
  assert.deepEqual(automationProjects(list), [{ id: "p1", title: "Alpha" }, { id: "p2", title: "Zeta" }]);
});

test("scheduleText: a reminder shows its date, a webhook says Webhook, a routine its label", () => {
  assert.equal(scheduleText(auto("a", { kind: "reminder", nextRunAt: tomorrow9 })), "Oct 26, 9:00");
  const lastRunAt = local(10, 24, 8, 30).toISOString();
  assert.equal(scheduleText(auto("a", { kind: "reminder", enabled: false, lastRunAt })), "Oct 24, 8:30");
  assert.equal(scheduleText(auto("a", { kind: "reminder", nextRunAt: null })), "");
  assert.equal(scheduleText(hook("h")), "Webhook");
  assert.equal(scheduleText(auto("a")), "Daily 9:00");
});
