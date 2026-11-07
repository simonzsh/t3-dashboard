import { test } from "bun:test";
import assert from "node:assert/strict";
import type { Automation, AutomationRun, DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import { automationsBadge, capitalize, copyableUrl, filterAutomations, finishedSetups, isEditable, isFinishedReminder, isRunning, runWhen, lastRunLine, latestFinished, latestUnread, liveRun, liveRuns, matchesFilter, modelLabel, nextRunLine, nextRunText, runDuration, runUnread, scheduleText, sortAutomations } from "../../../src/features/automations/automations.ts";
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
    modelSelection: null,
    prompt: "Do it",
    schedule: null,
    runtimeMode: null,
    bound: false,
    webhook: null,
    runs: [],
    ...over,
  };
}

// Local-time constructor: the labels use the browser's zone, so tests must not assume one.
const local = (m: number, d: number, h: number, min: number) => new Date(2026, m - 1, d, h, min);
const NOW = local(10, 25, 14, 0);

test("isFinishedReminder needs a disabled reminder that ran", () => {
  const lastRunAt = "2026-10-24T09:00:00.000Z";
  assert.equal(isFinishedReminder(auto("a", { kind: "reminder", enabled: false, lastRunAt })), true);
  assert.equal(isFinishedReminder(auto("a", { kind: "reminder", enabled: false })), false);
  assert.equal(isFinishedReminder(auto("a", { kind: "reminder", lastRunAt })), false);
  assert.equal(isFinishedReminder(auto("a", { enabled: false, lastRunAt })), false);
});

test("finishedSetups lists the setup threads that stopped being active", () => {
  const active = [thread("t-run", { status: "running" })];
  assert.deepEqual(finishedSetups(new Set(["t-run", "t-done"]), active), ["t-done"]);
  assert.deepEqual(finishedSetups(new Set(), active), []);
});

const hook = (id: string, over: Partial<Automation> = {}) => auto(id, { kind: "webhook", webhook: { url: null, signed: true, filters: [], signature: null }, ...over });

test("copyableUrl gives the URL of a webhook only", () => {
  const url = "https://relay.example.invalid/v1/hooks/k/t/token";
  assert.equal(copyableUrl(hook("a", { webhook: { url, signed: true, filters: [], signature: null } })), url);
  assert.equal(copyableUrl(hook("b", { webhook: { url: null, signed: false, filters: [], signature: null } })), null);
  assert.equal(copyableUrl(auto("c")), null);
});

const run = (threadId: string | null, startedAt: string, over: Partial<AutomationRun> = {}): AutomationRun => ({ threadId, startedAt, finishedAt: null, status: "succeeded", error: null, ...over });
const at = (h: number, min = 0) => local(10, 25, h, min).toISOString();
const byId = (...list: DashboardThread[]) => new Map(list.map((t) => [t.id, t]));
const waitingThread = thread("t1", { status: "waiting", pending: { category: "approval" } });
const tomorrow9 = local(10, 26, 9, 0).toISOString();
const NO_SEEN = { since: "2026-01-01T00:00:00.000Z", seen: {} };
const SEEN = { since: "2026-01-01T00:00:00.000Z", seen: { t1: "2026-01-10T10:00:00.000Z" } };

test("liveRun lets the thread override a stored status", () => {
  const stored = run("t1", at(9), { status: "running" });
  assert.equal(liveRun(stored, thread("t1", { status: "completed" })).status, "succeeded");
  assert.equal(liveRun(stored, waitingThread).status, "waiting");
  assert.equal(liveRun(run("t1", at(9)), thread("t1", { status: "running" })).status, "running");
  const failed = liveRun(run("t1", at(9)), thread("t1", { status: "failed", lastError: "turn failed" }));
  assert.deepEqual([failed.status, failed.error], ["failed", "turn failed"]);
});

test("liveRun keeps the stored status for an idle thread or a missing thread", () => {
  assert.equal(liveRun(run("t1", at(9), { status: "unknown" }), thread("t1")).status, "unknown");
  assert.equal(liveRun(run("t1", at(9), { status: "failed" }), undefined).status, "failed");
});

test("liveRun ends a run the thread finished, at the last activity", () => {
  const ended = liveRun(run("t1", at(9), { status: "running" }), thread("t1", { status: "completed", lastActivityAt: at(9, 5) }));
  assert.equal(ended.finishedAt, at(9, 5));
});

test("liveRuns layers the thread on every run of an unbound task but only on the newest of a bound one", () => {
  const runs = [run("t1", at(10), { status: "running" }), run("t1", at(9), { status: "running" })];
  const done = byId(thread("t1", { status: "completed" }));
  assert.deepEqual(liveRuns(auto("a", { runs }), done).map((r) => r.status), ["succeeded", "succeeded"]);
  assert.deepEqual(liveRuns(auto("a", { bound: true, runs }), done).map((r) => r.status), ["succeeded", "running"]);
});

test("latestFinished skips a run in progress", () => {
  const runs = [run("t2", at(11), { status: "running" }), run("t1", at(9), { status: "failed" })];
  assert.equal(latestFinished(auto("a", { runs }), byId())?.threadId, "t1");
  assert.equal(latestFinished(auto("a", { runs: [runs[0]!] }), byId()), null);
});

test("automationsBadge counts automations whose latest finished run is unread, and flags a failure", () => {
  const list = [
    auto("a", { runs: [run("t1", at(9))] }),
    auto("b", { runs: [run("t2", at(9), { status: "failed" })] }),
    auto("c", { runs: [run("t3", at(9))] }),
    auto("d", { runs: [run("t4", at(9))] }),
    auto("e", { runs: [run(null, at(9), { status: "failed" })] }),
  ];
  const threads = byId(thread("t1", { status: "completed" }), thread("t2", { status: "failed" }), thread("t3", { status: "completed" }));
  const seen = { since: NO_SEEN.since, seen: { t3: "2026-01-10T10:00:00.000Z" } };
  assert.deepEqual(automationsBadge(list, threads, seen), { count: 2, failed: true });
  assert.deepEqual(automationsBadge([list[0]!], threads, NO_SEEN), { count: 1, failed: false });
  assert.deepEqual(automationsBadge(list, threads, { since: "2027-01-01T00:00:00.000Z", seen: {} }), { count: 0, failed: false });
});

test("automationsBadge reads only the latest finished run of a task", () => {
  const list = [auto("a", { runs: [run("t1", at(11)), run("t2", at(9))] })];
  assert.deepEqual(automationsBadge(list, byId(thread("t1", { status: "completed" }), thread("t2", { status: "completed" })), SEEN), { count: 0, failed: false });
});

test("runDuration formats seconds, minutes and hours; a running run counts up to now", () => {
  const start = at(9);
  const ended = (ms: number) => run("t", start, { finishedAt: new Date(new Date(start).getTime() + ms).toISOString() });
  assert.equal(runDuration(ended(42_000), NOW), "42 s");
  assert.equal(runDuration(ended(3 * 60_000 + 20_000), NOW), "3 min");
  assert.equal(runDuration(ended(65 * 60_000), NOW), "1 h 05");
  assert.equal(runDuration(run("t", at(13, 30), { status: "running" }), NOW), "30 min");
  assert.equal(runDuration(run("t", start), NOW), null);
});

test("matchesFilter: unread follows the latest finished run, like the badge", () => {
  const a = auto("a", { runs: [run("t1", at(9))] });
  const done = byId(thread("t1", { status: "completed", lastActivityAt: at(9, 5) }));
  assert.equal(matchesFilter(a, "unread", done, { since: at(0), seen: {} }), true);
  assert.equal(matchesFilter(a, "unread", done, { since: at(0), seen: { t1: at(10) } }), false);
  assert.equal(matchesFilter(a, "all", done, SEEN), true);
});

test("matchesFilter: failed is the latest run failed, a dispatch failure included", () => {
  const failed = run("t1", at(9));
  assert.equal(matchesFilter(auto("a", { runs: [failed] }), "failed", byId(thread("t1", { status: "failed" })), SEEN), true);
  assert.equal(matchesFilter(auto("a", { runs: [run(null, at(9), { status: "failed", error: "no slot" })] }), "failed", byId(), SEEN), true);
  assert.equal(matchesFilter(auto("a", { runs: [run("t2", at(10)), failed] }), "failed", byId(thread("t2", { status: "completed" }), thread("t1", { status: "failed" })), SEEN), false);
});

test("matchesFilter: running and paused", () => {
  const a = auto("a", { runs: [run("t1", at(9))] });
  assert.equal(matchesFilter(a, "running", byId(thread("t1", { status: "running" })), SEEN), true);
  assert.equal(matchesFilter(a, "running", byId(thread("t1", { status: "completed" })), SEEN), false);
  assert.equal(matchesFilter(a, "paused", byId(), SEEN), false);
  assert.equal(matchesFilter(auto("a", { enabled: false }), "paused", byId(), SEEN), true);
  const done = auto("r", { kind: "reminder", enabled: false, lastRunAt: at(9) });
  assert.equal(matchesFilter(done, "paused", byId(), SEEN), true);
});

test("scheduleText: a reminder shows its date, a webhook says Webhook, a routine its label", () => {
  assert.equal(scheduleText(auto("a", { kind: "reminder", nextRunAt: tomorrow9 })), "Oct 26, 9:00");
  const lastRunAt = local(10, 24, 8, 30).toISOString();
  assert.equal(scheduleText(auto("a", { kind: "reminder", enabled: false, lastRunAt })), "Oct 24, 8:30");
  assert.equal(scheduleText(auto("a", { kind: "reminder", nextRunAt: null })), "");
  assert.equal(scheduleText(hook("h")), "Webhook");
  assert.equal(scheduleText(auto("a")), "Daily 9:00");
});

test("modelLabel gives the provider and the display name, or the raw id for an unknown model", () => {
  const providers = [{ instanceId: "codex", displayName: "Codex", models: [{ slug: "gpt-x", name: "GPT X", effort: null, speed: null, favorite: null }] }] as unknown as DashboardProvider[];
  assert.deepEqual(modelLabel(providers, { instanceId: "codex", model: "gpt-x" }), { instanceId: "codex", name: "GPT X" });
  assert.deepEqual(modelLabel(providers, { instanceId: "codex", model: "gone" }), { instanceId: "codex", name: "gone" });
  assert.deepEqual(modelLabel([], { instanceId: "claudeAgent", model: "m" }), { instanceId: "claudeAgent", name: "m" });
  assert.equal(modelLabel(providers, null), null);
});

test("isEditable refuses a routine without a readable schedule and a signed webhook without a readable signature", () => {
  const routine = { type: "interval", everyMinutes: 15 } as const;
  const webhook = (signed: boolean, signature: { header: string; encoding: "hex"; prefix: string } | null) => ({ url: null, signed, filters: [], signature });
  assert.equal(isEditable(auto("a", { kind: "routine", schedule: routine })), true);
  assert.equal(isEditable(auto("a", { kind: "routine", schedule: null })), false);
  assert.equal(isEditable(auto("a", { kind: "reminder", schedule: null })), true);
  assert.equal(isEditable(auto("a", { kind: "webhook", webhook: webhook(true, null) })), false);
  assert.equal(isEditable(auto("a", { kind: "webhook", webhook: webhook(true, { header: "X-Sig", encoding: "hex", prefix: "" }) })), true);
  assert.equal(isEditable(auto("a", { kind: "webhook", webhook: webhook(false, null) })), true);
});

test("nextRunText: paused, finished, webhook and scheduled tasks", () => {
  assert.equal(nextRunText(auto("a", { enabled: false }), NOW), "Paused");
  assert.equal(nextRunText(auto("r", { kind: "reminder", enabled: false, lastRunAt: at(9) }), NOW), "—");
  assert.equal(nextRunText(hook("h"), NOW), "On each delivery");
  assert.equal(nextRunText(auto("a", { nextRunAt: local(10, 25, 14, 30).toISOString() }), NOW), "in 30 min");
  assert.equal(nextRunText(auto("a"), NOW), "—");
});

test("liveRun keeps a failure T3 reported when the thread reads done", () => {
  assert.equal(liveRun(run("t1", at(9), { status: "failed", error: "Timed out" }), thread("t1", { status: "completed" })).status, "failed");
});

test("runUnread marks only the newest run of a bound task", () => {
  const runs = [run("chat", at(10)), run("chat", at(9))];
  const threads = new Map([["chat", thread("chat", { lastActivityAt: at(10, 5) })]]);
  const seen = { since: at(0), seen: {} };
  assert.deepEqual(runs.map((r) => runUnread(auto("a", { bound: true, runs }), r, threads, seen)), [true, false]);
  assert.deepEqual(runs.map((r) => runUnread(auto("a", { runs }), r, threads, seen)), [true, true]);
});

test("lastRunLine says how the latest run ended, through its thread", () => {
  const runs = [run("t1", at(11), { finishedAt: at(11, 3) })];
  const line = (threads: Map<string, DashboardThread>, list = runs) => lastRunLine(auto("a", { runs: list }), threads, NOW);
  assert.deepEqual(line(byId(thread("t1", { status: "completed" }))), { status: "succeeded", label: "Succeeded", detail: "3 h ago · 3 min" });
  assert.deepEqual(line(byId(thread("t1", { status: "failed", lastError: "boom" }))), { status: "failed", label: "Failed", detail: "3 h ago · 3 min" });
  assert.equal(line(byId(waitingThread)).label, "Waiting for you");
  assert.deepEqual(line(byId(thread("t1", { status: "running" })), [run("t1", at(13, 30))]), { status: "running", label: "Running", detail: "30 min ago · 30 min" });
  assert.deepEqual(line(byId(), []), { status: null, label: "Never run", detail: "" });
});

test("lastRunLine has no duration while the end is unknown", () => {
  assert.equal(lastRunLine(auto("a", { runs: [run(null, at(13), { status: "failed", error: "no slot" })] }), byId(), NOW).detail, "1 h ago");
});

test("isRunning follows the latest run only", () => {
  assert.equal(isRunning(auto("a", { runs: [run("t1", at(9))] }), byId(thread("t1", { status: "running" }))), true);
  assert.equal(isRunning(auto("a", { runs: [run("t2", at(10)), run("t1", at(9), { status: "running" })] }), byId()), false);
});

test("latestUnread is true while the latest finished run is unread", () => {
  const a = auto("a", { runs: [run("t1", at(9))] });
  const threads = byId(thread("t1", { status: "completed", lastActivityAt: at(9, 5) }));
  assert.equal(latestUnread(a, threads, { since: at(0), seen: {} }), true);
  assert.equal(latestUnread(a, threads, { since: at(0), seen: { t1: at(10) } }), false);
  assert.equal(latestUnread(auto("b"), threads, NO_SEEN), false);
});

test("sortAutomations: recent activity puts the newest run first and never-run tasks last", () => {
  const list = [auto("never"), auto("old", { runs: [run("t1", at(8))] }), auto("new", { runs: [run("t2", at(11))] })];
  assert.deepEqual(sortAutomations(list, "recent").map((a) => a.id), ["new", "old", "never"]);
  assert.deepEqual(sortAutomations(list, "project").map((a) => a.id), ["new", "old", "never"]);
});

test("sortAutomations: next run in order, webhooks and paused tasks last", () => {
  const list = [
    auto("paused", { enabled: false, nextRunAt: local(10, 26, 9, 0).toISOString() }),
    hook("hook"),
    auto("later", { nextRunAt: local(10, 30, 9, 0).toISOString() }),
    auto("soon", { nextRunAt: tomorrow9 }),
  ];
  assert.deepEqual(sortAutomations(list, "next").map((a) => a.id), ["soon", "later", "hook", "paused"]);
});

test("filterAutomations matches title, project name and schedule, ignoring case and outer spaces", () => {
  const list = [auto("a", { title: "Nightly Backup", project: "Alpha", scheduleLabel: "Daily 2:00" }), auto("b", { title: "Report", project: "Beta", scheduleLabel: "Weekly Mon" })];
  const ids = (query: string) => filterAutomations(list, query).map((a) => a.id);
  assert.deepEqual(ids(""), ["a", "b"]);
  assert.deepEqual(ids("  backup "), ["a"]);
  assert.deepEqual(ids("BETA"), ["b"]);
  assert.deepEqual(ids("weekly"), ["b"]);
  assert.deepEqual(ids("nothing"), []);
});

test("nextRunLine: relative next run, paused, webhook and finished", () => {
  const next = (min: number) => auto("a", { nextRunAt: new Date(NOW.getTime() + min * 60_000).toISOString() });
  assert.equal(nextRunLine(next(30), NOW), "Next in 30 min");
  assert.equal(nextRunLine(next(3 * 60 + 10), NOW), "Next in 3 h");
  assert.equal(nextRunLine(next(2 * 1440 + 60), NOW), "Next in 2 d");
  assert.equal(nextRunLine(next(0), NOW), "Next now");
  assert.equal(nextRunLine(auto("a", { enabled: false }), NOW), "Paused");
  assert.equal(nextRunLine(hook("h"), NOW), "On each delivery");
  assert.equal(nextRunLine(auto("r", { kind: "reminder", enabled: false, lastRunAt: at(9) }), NOW), "");
  assert.equal(nextRunLine(auto("a"), NOW), "");
});

test("capitalize raises the first letter only", () => {
  assert.equal(capitalize("every 15 minutes"), "Every 15 minutes");
  assert.equal(capitalize(""), "");
});

test("runWhen leaves the duration out for a bound chat", () => {
  const done = run("chat", at(9), { finishedAt: at(12) });
  const now = new Date(at(13));
  assert.match(runWhen(done, now), /3 h/);
  assert.doesNotMatch(runWhen(done, now, true), /·/);
});
