import assert from "node:assert/strict";
import { test } from "bun:test";
import { AutomationGuard, guardActions } from "../../src/domain/automationGuard.ts";
import type { RawScheduledTask } from "../../src/integrations/t3/schemas.ts";
import { FakePort } from "../helpers/fakePort.ts";

const none = new Set<string>();
const finished = (over: Partial<RawScheduledTask> = {}): RawScheduledTask => ({ id: "r1", title: "Reminder: Call", prompt: "Call", enabled: true, schedule: { type: "interval", everyMs: 60_000 }, lastRunAt: "2026-11-05T09:00:00.000Z", lastRunStatus: "succeeded", runCount: 1, ...over });
const kinds = (tasks: RawScheduledTask[], done = none) => guardActions(tasks, done).map((action) => `${action.kind}:${action.id}`);

test("a worktree task is moved to the project folder, other workspaces are left alone", () => {
  const tasks = ["worktree", "root", "existing_worktree"].map((type, i) => ({ id: `t${i}`, title: "Daily", workspaceStrategy: { type } }));
  assert.deepEqual(kinds(tasks), ["root:t0"]);
  assert.deepEqual(kinds([{ id: "bound", title: "Daily", threadId: "th1", workspaceStrategy: { type: "worktree" } }]), ["root:bound"]);
});

test("a webhook task in a worktree is moved too", () => {
  assert.deepEqual(kinds([{ id: "h", title: "Hook", schedule: { type: "webhook" }, workspaceStrategy: { type: "worktree" } }]), ["root:h"]);
});

test("a reminder is paused once its run succeeded or failed", () => {
  assert.deepEqual(kinds([finished()]), ["pause:r1"]);
  assert.deepEqual(kinds([finished({ lastRunStatus: "failed", lastRunError: "boom" })]), ["pause:r1"]);
});

test("a reminder is not paused while it runs, before any run, when paused, or when it is not a reminder", () => {
  const cases = [
    finished({ lastRunStatus: "running" }),
    finished({ lastRunStatus: "never", lastRunAt: null, runCount: 0 }),
    finished({ runCount: 0, lastRunAt: null }),
    finished({ enabled: false }),
    finished({ title: "Call" }),
    finished({ title: "Reminder: Hook", schedule: { type: "webhook" } }),
  ];
  for (const task of cases) assert.deepEqual(kinds([task]), [], JSON.stringify(task));
});

test("runCount is optional: a last run date counts as one run", () => {
  assert.deepEqual(kinds([finished({ runCount: null })]), ["pause:r1"]);
  assert.deepEqual(kinds([finished({ runCount: undefined, lastRunAt: null })]), []);
});

test("an older reminder that pauses itself is paused by the guard too", () => {
  const task = finished({ title: "Call", prompt: "Call\n\nThen disable this scheduled task: call schedule_task with scheduledTaskId r1 and enabled: false. Do not delete it." });
  assert.deepEqual(kinds([task]), ["pause:r1"]);
});

test("a state that was already tried is skipped", () => {
  const [action] = guardActions([finished()], none);
  assert.deepEqual(kinds([finished()], new Set([action!.key])), []);
  assert.deepEqual(kinds([finished({ lastRunAt: "2026-11-06T09:00:00.000Z" })], new Set([action!.key])), ["pause:r1"]);
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function guardWith(port = new FakePort(), sleep: (ms: number) => Promise<void> = () => new Promise(() => {})) {
  const warnings: string[] = [];
  const guard = new AutomationGuard({ port, warn: (message) => warnings.push(message), sleep });
  guard.start();
  return { guard, port, warnings };
}

test("the guard moves and pauses once per state", async () => {
  const { guard, port } = guardWith();
  const tasks = [finished(), { id: "w", title: "Daily", workspaceStrategy: { type: "worktree" } }];
  port.taskSubscriptions[0]!.onTasks(tasks);
  await flush();
  port.taskSubscriptions[0]!.onTasks(tasks);
  await flush();
  assert.deepEqual(port.enabledCalls, [{ id: "r1", enabled: false }]);
  assert.deepEqual(port.workspaceCalls, [{ id: "w", workspaceStrategy: { type: "root" } }]);
  port.taskSubscriptions[0]!.onTasks([finished({ lastRunAt: "2026-11-06T09:00:00.000Z" })]);
  await flush();
  assert.equal(port.enabledCalls.length, 2);
  guard.stop();
});

test("a task already in the project folder causes no call", async () => {
  const { guard, port } = guardWith();
  port.taskSubscriptions[0]!.onTasks([{ id: "w", title: "Daily", workspaceStrategy: { type: "root" } }]);
  await flush();
  assert.deepEqual([port.workspaceCalls, port.enabledCalls], [[], []]);
  guard.stop();
});

test("a failed call warns without a payload and is not tried again for the same state", async () => {
  const { guard, port, warnings } = guardWith();
  port.enabledError = new Error("T3 down");
  port.workspaceError = new Error("T3 refused");
  const tasks = [finished({ prompt: "secret-prompt" }), { id: "w", title: "Daily", workspaceStrategy: { type: "worktree" } }];
  port.taskSubscriptions[0]!.onTasks(tasks);
  await flush();
  port.taskSubscriptions[0]!.onTasks(tasks);
  await flush();
  assert.deepEqual(warnings, ["Could not pause reminder r1: T3 down", "Could not move scheduled task w to the project folder: T3 refused"]);
  guard.stop();
});

test("snapshots are handled one after the other", async () => {
  const port = new FakePort();
  const order: string[] = [];
  port.setScheduledTaskEnabled = async (id) => {
    order.push(`start ${id}`);
    await flush();
    order.push(`end ${id}`);
  };
  const { guard } = guardWith(port);
  port.taskSubscriptions[0]!.onTasks([finished({ id: "a" })]);
  port.taskSubscriptions[0]!.onTasks([finished({ id: "b" })]);
  await flush();
  await flush();
  await flush();
  assert.deepEqual(order, ["start a", "end a", "start b", "end b"]);
  guard.stop();
});

test("the guard subscribes again after the stream ends, and stop cancels it", async () => {
  const waits: number[] = [];
  const { guard, port } = guardWith(new FakePort(), async (ms) => void waits.push(ms));
  port.taskSubscriptions[0]!.onEnd(new Error("cut"));
  await flush();
  assert.equal(port.taskSubscriptions.length, 2);
  assert.deepEqual(waits, [1000]);
  port.taskSubscriptions[1]!.onTasks([]);
  port.taskSubscriptions[1]!.onEnd();
  await flush();
  assert.deepEqual(waits, [1000, 1000]);
  guard.stop();
  assert.equal(port.taskSubscriptions.at(-1)!.cancelled, true);
  const count = port.taskSubscriptions.length;
  await flush();
  assert.equal(port.taskSubscriptions.length, count);
});

test("retryNow wakes the wait before the next subscription", async () => {
  const { guard, port } = guardWith();
  port.taskSubscriptions[0]!.onEnd(new Error("cut"));
  await flush();
  assert.equal(port.taskSubscriptions.length, 1);
  guard.retryNow();
  await flush();
  assert.equal(port.taskSubscriptions.length, 2);
  guard.stop();
});
