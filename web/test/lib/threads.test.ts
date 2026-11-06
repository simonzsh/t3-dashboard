import { test } from "bun:test";
import assert from "node:assert/strict";
import { pendingLabel, providerKind, threadTitle } from "../../src/lib/threads.ts";
import { agentStatus, runActive, threadState } from "../../../shared/status.ts";
import { thread } from "../fixtures.ts";

const now = new Date("2026-03-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const pending = { requestId: "r", kind: "command", category: "approval" as const };

test("agentStatus: pending wins over a running status", () => {
  assert.equal(agentStatus(thread("1", { pending, status: "running" })), "waiting");
});

test("agentStatus: active statuses are working", () => {
  for (const status of ["preparing", "queued", "starting", "running"]) {
    assert.equal(agentStatus(thread("1", { status })), "working", status);
  }
});

test("agentStatus: finished threads stay, whatever their age", () => {
  for (const status of ["completed", "interrupted", "failed", "cancelled", "rolled_back"]) {
    assert.equal(agentStatus(thread("1", { status, lastActivityAt: hoursAgo(23) })), "finished", status);
    assert.equal(agentStatus(thread("1", { status, lastActivityAt: hoursAgo(24 * 30) })), "finished", status);
  }
});

test("agentStatus: other threads are idle", () => {
  assert.equal(agentStatus(thread("1", { status: "idle", lastActivityAt: hoursAgo(1) })), "idle");
});

test("providerKind recognises the two providers and falls back", () => {
  assert.equal(providerKind("claudeAgent"), "claude");
  assert.equal(providerKind("codex"), "codex");
  assert.equal(providerKind("codex_work"), "codex");
  assert.equal(providerKind("other"), "other");
});

test("pendingLabel names the kind of request", () => {
  assert.equal(pendingLabel("approval"), "Approval");
  assert.equal(pendingLabel("user-input"), "Question");
  assert.equal(pendingLabel("other"), "Action required");
});

test("a finished turn with subagents still running stays working", () => {
  const busy = thread("1", { status: "completed", backgroundWork: true, lastActivityAt: hoursAgo(1) });
  assert.equal(agentStatus(busy), "working");
  assert.equal(threadState(busy), "running");
  assert.equal(threadState(thread("1", { pending, status: "completed", backgroundWork: true })), "waiting");
});

test("runActive: an active status or run id, but not background work alone", () => {
  assert.equal(runActive(thread("1", { status: "running" })), true);
  assert.equal(runActive(thread("1", { status: "idle", activeRunId: "run-1" })), true);
  assert.equal(runActive(thread("1", { status: "completed", backgroundWork: true })), false);
});

test("threadState gives the sessions window colour", () => {
  assert.equal(threadState(thread("1", { pending, status: "running" })), "waiting");
  assert.equal(threadState(thread("1", { status: "running" })), "running");
  assert.equal(threadState(thread("1", { status: "completed" })), "done");
  assert.equal(threadState(thread("1", { status: "failed" })), "error");
  assert.equal(threadState(thread("1", { status: "completed", lastError: "boom" })), "error");
  assert.equal(threadState(thread("1", { status: "idle" })), "idle");
});

test("threadTitle falls back to (untitled) for an empty title or no thread", () => {
  assert.equal(threadTitle(thread("a", { title: "Fix it" })), "Fix it");
  assert.equal(threadTitle(thread("a", { title: "" })), "(untitled)");
  assert.equal(threadTitle(null), "(untitled)");
});
