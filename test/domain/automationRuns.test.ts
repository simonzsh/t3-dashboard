import assert from "node:assert/strict";
import { test } from "bun:test";
import type { AutomationRun } from "../../shared/automations.ts";
import { AutomationRunLog, recordRuns, type RunLog } from "../../src/domain/automationRuns.ts";
import type { RawScheduledTask, RawThread } from "../../src/integrations/t3/schemas.ts";

const NOW = new Date("2026-03-21T12:00:00.000Z");

const task = (extra: Partial<RawScheduledTask> = {}): RawScheduledTask => ({
  id: "task-1",
  title: "Inbox triage",
  prompt: "Triage",
  enabled: true,
  schedule: { type: "interval", everyMs: 900_000 },
  projectId: "project-1",
  threadId: null,
  createdAt: "2026-03-19T09:00:00.000Z",
  creationSource: "mcp",
  ...extra,
});

const thread = (id: string, extra: Partial<RawThread> = {}): RawThread => ({
  id,
  projectId: "project-1",
  title: "Inbox triage",
  creationSource: "mcp",
  createdAt: "2026-03-20T10:00:00.000Z",
  status: "completed",
  latestRunCompletedAt: "2026-03-20T10:05:00.000Z",
  ...extra,
});

const stored = (extra: Partial<AutomationRun> = {}): AutomationRun => ({ threadId: "run-1", startedAt: "2026-03-20T10:00:00.000Z", finishedAt: "2026-03-20T10:05:00.000Z", status: "succeeded", error: null, ...extra });
const record = (log: RunLog, tasks: RawScheduledTask[], threads: RawThread[]) => recordRuns(log, tasks, threads, NOW);

test("an unbound task gets one run per matched thread, newest first, with the status of the thread", () => {
  const log = record({}, [task()], [
    thread("done", { createdAt: "2026-03-20T10:00:00.000Z" }),
    thread("failed", { createdAt: "2026-03-20T11:00:00.000Z", status: "failed", lastError: "Boom", latestRunCompletedAt: "2026-03-20T11:02:00.000Z" }),
    thread("working", { createdAt: "2026-03-20T12:00:00.000Z", status: "running", activeRunId: "r", latestRunCompletedAt: null }),
    thread("asking", { createdAt: "2026-03-20T13:00:00.000Z", status: "running", pendingRuntimeRequest: { id: "q", kind: "user_input" }, latestRunCompletedAt: null }),
    thread("idle", { createdAt: "2026-03-20T14:00:00.000Z", status: "idle", latestRunCompletedAt: null }),
    thread("unrelated", { title: "Other" }),
  ]);
  assert.deepEqual(
    log["task-1"]!.map(({ threadId, status, finishedAt, error }) => [threadId, status, finishedAt, error]),
    [
      ["idle", "unknown", null, null],
      ["asking", "waiting", null, null],
      ["working", "running", null, null],
      ["failed", "failed", "2026-03-20T11:02:00.000Z", "Boom"],
      ["done", "succeeded", "2026-03-20T10:05:00.000Z", null],
    ],
  );
  assert.equal(log["task-1"]![4]!.startedAt, "2026-03-20T10:00:00.000Z");
});

test("a finished thread whose run end is unknown takes its last activity as the end", () => {
  const [run] = record({}, [task()], [thread("done", { latestRunCompletedAt: null, status: "completed", updatedAt: "x", latestVisibleMessage: { role: "assistant", text: "ok", updatedAt: "2026-03-20T10:07:00.000Z" } })])["task-1"]!;
  assert.equal(run!.finishedAt, "2026-03-20T10:07:00.000Z");
});

test("a failed task with no thread near its last run adds a run with no thread", () => {
  const failed = task({ lastRunAt: "2026-03-21T09:00:00.000Z", lastRunStatus: "failed", lastRunError: "Could not start" });
  const log = record({}, [failed], [thread("old", { createdAt: "2026-03-20T10:00:00.000Z" })]);
  assert.deepEqual(log["task-1"]![0], { threadId: null, startedAt: "2026-03-21T09:00:00.000Z", finishedAt: null, status: "failed", error: "Could not start" });
  assert.equal(log["task-1"]!.length, 2);
  assert.equal(record(log, [failed], [thread("old")])["task-1"]!.length, 2);
});

test("a failed task with a thread near its last run marks that run failed, unless it still works", () => {
  const failed = task({ lastRunAt: "2026-03-20T10:01:00.000Z", lastRunStatus: "failed", lastRunError: "Provider error" });
  const [run] = record({}, [failed], [thread("near")])["task-1"]!;
  assert.deepEqual([run!.threadId, run!.status, run!.error], ["near", "failed", "Provider error"]);
  const working = thread("near", { status: "running", activeRunId: "r", latestRunCompletedAt: null });
  assert.equal(record({}, [failed], [working])["task-1"]!.length, 1);
  assert.equal(record({}, [failed], [working])["task-1"]![0]!.status, "running");
});

test("a bound task gains a run when its last run time is new, and only the current run follows the thread", () => {
  const bound = (lastRunAt: string) => task({ threadId: "chat", lastRunAt, lastRunStatus: "succeeded" });
  const chat = thread("chat", { createdAt: "2026-03-19T09:00:00.000Z" });
  const first = record({}, [bound("2026-03-20T08:00:00.000Z")], [chat]);
  assert.deepEqual(first["task-1"]!.map((run) => [run.threadId, run.startedAt, run.status]), [["chat", "2026-03-20T08:00:00.000Z", "succeeded"]]);
  const second = record(first, [bound("2026-03-21T08:00:00.000Z")], [thread("chat", { status: "running", activeRunId: "r", latestRunCompletedAt: null })]);
  assert.deepEqual(second["task-1"]!.map((run) => [run.startedAt, run.status]), [["2026-03-21T08:00:00.000Z", "running"], ["2026-03-20T08:00:00.000Z", "succeeded"]]);
  const again = record(second, [bound("2026-03-21T08:00:00.000Z")], [chat]);
  assert.equal(again["task-1"]!.length, 2);
});

test("an older bound run that still shows running becomes unknown", () => {
  const log: RunLog = { "task-1": [stored({ threadId: "chat", startedAt: "2026-03-20T08:00:00.000Z", status: "running", finishedAt: null })] };
  const next = record(log, [task({ threadId: "chat", lastRunAt: "2026-03-21T08:00:00.000Z", lastRunStatus: "succeeded" })], [thread("chat")]);
  assert.deepEqual(next["task-1"]!.map((run) => run.status), ["succeeded", "unknown"]);
});

test("a run whose thread is gone stays, and a run that was working becomes unknown", () => {
  const log: RunLog = { "task-1": [stored({ threadId: "gone-a" }), stored({ threadId: "gone-b", startedAt: "2026-03-20T09:00:00.000Z", status: "running", finishedAt: null }), stored({ threadId: "gone-c", startedAt: "2026-03-20T08:00:00.000Z", status: "waiting", finishedAt: null })] };
  const next = record(log, [task()], []);
  assert.deepEqual(next["task-1"]!.map((run) => [run.threadId, run.status]), [["gone-a", "succeeded"], ["gone-b", "unknown"], ["gone-c", "unknown"]]);
});

test("an archived thread keeps its stored run", () => {
  const log: RunLog = { "task-1": [stored()] };
  const next = record(log, [task()], [thread("run-1", { archivedAt: "2026-03-21T00:00:00.000Z", status: "running", activeRunId: "r" })]);
  assert.deepEqual(next, log);
});

test("a task keeps its 20 newest runs", () => {
  const threads = Array.from({ length: 25 }, (_, index) => thread(`run-${index}`, { createdAt: new Date(Date.parse("2026-03-20T00:00:00.000Z") + index * 3_600_000).toISOString() }));
  const runs = record({}, [task()], threads)["task-1"]!;
  assert.equal(runs.length, 20);
  assert.equal(runs[0]!.threadId, "run-24");
  assert.equal(runs.at(-1)!.threadId, "run-5");
});

test("tasks that no longer exist leave the log", () => {
  const log: RunLog = { "task-1": [stored()], "task-gone": [stored()] };
  assert.deepEqual(Object.keys(record(log, [task()], [])), ["task-1"]);
});

test("a run log that did not change persists nothing, a changed one persists once", () => {
  const writes: RunLog[] = [];
  const store = new AutomationRunLog({}, (log) => void writes.push(log));
  const next = record(store.current(), [task()], [thread("run-1")]);
  store.record(next);
  store.record(record(store.current(), [task()], [thread("run-1")]));
  assert.equal(writes.length, 1);
  store.drop("task-1");
  store.drop("task-1");
  assert.deepEqual([writes.length, store.current()], [2, {}]);
});

test("a write error keeps the log in memory and only warns", () => {
  const warnings: string[] = [];
  const store = new AutomationRunLog({}, () => { throw new Error("disk full"); }, (message) => warnings.push(message));
  store.record({ "task-1": [stored()] });
  assert.equal(store.current()["task-1"]!.length, 1);
  assert.match(warnings[0]!, /disk full/);
});
