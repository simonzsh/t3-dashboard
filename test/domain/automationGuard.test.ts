import assert from "node:assert/strict";
import { test } from "bun:test";
import { RearmedStore } from "../../src/domain/rearmedStore.ts";
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

test("a reminder changed long after its run is not paused again: someone enabled it", () => {
  assert.deepEqual(kinds([finished({ updatedAt: "2026-11-05T09:00:20.000Z" })]), ["pause:r1"]);
  assert.deepEqual(kinds([finished({ updatedAt: "2026-11-06T10:00:00.000Z" })]), []);
});

test("a state that was already tried is skipped", () => {
  const [action] = guardActions([finished()], none);
  assert.deepEqual(kinds([finished()], new Set([action!.key])), []);
  assert.deepEqual(kinds([finished({ lastRunAt: "2026-11-06T09:00:00.000Z" })], new Set([action!.key])), ["pause:r1"]);
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function guardWith(port = new FakePort(), sleep: (ms: number) => Promise<void> = () => new Promise(() => {}), now: () => number = Date.now) {
  const warnings: string[] = [];
  const guard = new AutomationGuard({ port, warn: (message) => warnings.push(message), sleep, now });
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
  let clock = 0;
  const { guard, port } = guardWith(new FakePort(), async (ms) => void waits.push(ms), () => clock);
  port.taskSubscriptions[0]!.onEnd(new Error("cut"));
  await flush();
  assert.equal(port.taskSubscriptions.length, 2);
  assert.deepEqual(waits, [1000]);
  // A stream that drops right after its snapshot keeps the backoff growing.
  port.taskSubscriptions[1]!.onTasks([]);
  port.taskSubscriptions[1]!.onEnd();
  await flush();
  assert.deepEqual(waits, [1000, 2000]);
  // A stream that stayed open resets it.
  port.taskSubscriptions[2]!.onTasks([]);
  clock += 60_000;
  port.taskSubscriptions[2]!.onEnd();
  await flush();
  assert.deepEqual(waits, [1000, 2000, 1000]);
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

test("a reminder edited after its run stays enabled until it runs again", async () => {
  const rearmed = new RearmedStore();
  const port = new FakePort();
  const guard = new AutomationGuard({ port, rearmed, warn: () => {}, sleep: () => new Promise(() => {}) });
  guard.start();
  const ran = finished();
  port.taskSubscriptions[0]!.onTasks([ran]);
  await flush();
  assert.deepEqual(port.enabledCalls, [{ id: "r1", enabled: false }]);
  // Edited 30 minutes later: T3 enables it, bumps updatedAt and keeps lastRunAt.
  rearmed.mark("r1", ran.lastRunAt!);
  port.taskSubscriptions[0]!.onTasks([{ ...ran, enabled: true, updatedAt: "2026-11-05T09:30:00.000Z" }]);
  await flush();
  assert.equal(port.enabledCalls.length, 1);
  // A new run changes lastRunAt: the pause happens again and the mark is pruned.
  port.taskSubscriptions[0]!.onTasks([{ ...ran, lastRunAt: "2026-11-06T09:00:00.000Z" }]);
  await flush();
  assert.equal(port.enabledCalls.length, 2);
  assert.equal(rearmed.has("r1", ran.lastRunAt), false);
  guard.stop();
});

test("a re-armed mark is dropped with its task", () => {
  const saved: Record<string, string>[] = [];
  const rearmed = new RearmedStore({ r1: "a", gone: "b" }, (marks) => saved.push(marks));
  rearmed.prune([{ id: "r1", lastRunAt: "a" }]);
  assert.deepEqual(saved, [{ r1: "a" }]);
});
