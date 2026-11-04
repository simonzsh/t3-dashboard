import { test } from "bun:test";
import assert from "node:assert/strict";
import { RUN_POLL_MS, SEND_POLL_WINDOW_MS, SUBAGENT_POLL_MS, detailRunning, pollDelay } from "../../../src/features/conversation/reload.ts";

const now = 1_000_000;
const idle = { running: false, sentAt: 0, background: false, now };

test("an idle thread is not polled", () => {
  assert.equal(pollDelay(idle), null);
});

test("a run, or a recent send, polls fast", () => {
  assert.equal(pollDelay({ ...idle, running: true }), RUN_POLL_MS);
  assert.equal(pollDelay({ ...idle, sentAt: now - 1000 }), RUN_POLL_MS);
  assert.equal(pollDelay({ ...idle, sentAt: now - SEND_POLL_WINDOW_MS }), null);
});

test("background work alone polls slowly", () => {
  assert.equal(pollDelay({ ...idle, background: true }), SUBAGENT_POLL_MS);
  assert.equal(pollDelay({ ...idle, background: true, running: true }), RUN_POLL_MS);
});

test("a thread outside the shell runs while its run has no end or a step runs", () => {
  const run = { runId: "r", startedAt: "2026-03-01T10:00:00Z", completedAt: null };
  const step = { status: "done" } as never;
  assert.equal(detailRunning(null), false);
  assert.equal(detailRunning({ activity: run, steps: [] }), true);
  assert.equal(detailRunning({ activity: { ...run, completedAt: "2026-03-01T10:05:00Z" }, steps: [step] }), false);
  assert.equal(detailRunning({ activity: null, steps: [step, { status: "running" } as never] }), true);
});
