import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardThread } from "../shared/api.ts";
import { ACTIVE_STATUSES, FAILED_STATUSES, FINISHED_STATUSES, RUNNING_RUN_STATUSES, agentStatus, hasFailed, runActive, threadState } from "../shared/status.ts";

const base: Pick<DashboardThread, "status" | "pending" | "activeRunId" | "backgroundWork" | "lastError"> = {
  status: "idle",
  pending: null,
  activeRunId: null,
  backgroundWork: false,
  lastError: null,
};
const of = (over: Partial<typeof base>) => ({ ...base, ...over });
const pending = { category: "approval" as const };

test("status sets list every known status", () => {
  assert.deepEqual([...ACTIVE_STATUSES].sort(), ["preparing", "queued", "running", "starting", "waiting"]);
  assert.deepEqual([...FINISHED_STATUSES].sort(), ["cancelled", "completed", "failed", "interrupted", "rolled_back"]);
  assert.deepEqual([...RUNNING_RUN_STATUSES].sort(), ["preparing", "running", "starting", "waiting"]);
  assert.deepEqual([...FAILED_STATUSES].sort(), ["canceled", "cancelled", "error", "errored", "failed", "interrupted"]);
});

test("every thread status maps to one agent status and one thread state", () => {
  const expected: Record<string, [string, string]> = {
    preparing: ["working", "running"],
    queued: ["working", "running"],
    starting: ["working", "running"],
    running: ["working", "running"],
    waiting: ["working", "running"],
    completed: ["finished", "done"],
    interrupted: ["finished", "done"],
    cancelled: ["finished", "done"],
    rolled_back: ["finished", "done"],
    failed: ["finished", "error"],
    idle: ["idle", "idle"],
    unknown: ["idle", "idle"],
  };
  for (const [status, [agent, state]] of Object.entries(expected)) {
    assert.equal(agentStatus(of({ status })), agent, status);
    assert.equal(threadState(of({ status })), state, status);
  }
});

test("a pending request wins over every status", () => {
  for (const status of ["running", "completed", "failed", "idle"]) {
    assert.equal(agentStatus(of({ status, pending })), "waiting", status);
    assert.equal(threadState(of({ status, pending })), "waiting", status);
  }
});

test("an active run or background work keeps a finished thread working", () => {
  assert.equal(agentStatus(of({ status: "completed", activeRunId: "run" })), "working");
  assert.equal(threadState(of({ status: "idle", activeRunId: "run" })), "running");
  assert.equal(agentStatus(of({ status: "completed", backgroundWork: true })), "working");
  assert.equal(threadState(of({ status: "failed", backgroundWork: true })), "running");
});

test("runActive ignores background work", () => {
  assert.equal(runActive(of({ backgroundWork: true })), false);
  assert.equal(runActive(of({ status: "running" })), true);
  assert.equal(runActive(of({ activeRunId: "run" })), true);
});

test("a last error is a failure, and an idle thread with an error is an error state", () => {
  assert.equal(hasFailed(of({ status: "completed", lastError: "boom" })), true);
  assert.equal(hasFailed(of({ status: "failed" })), true);
  assert.equal(hasFailed(of({ status: "cancelled" })), false);
  assert.equal(threadState(of({ status: "idle", lastError: "boom" })), "error");
  assert.equal(agentStatus(of({ status: "idle", lastError: "boom" })), "idle");
});
