import { test } from "bun:test";
import assert from "node:assert/strict";
import { RUN_POLL_MS, SEND_POLL_WINDOW_MS, SUBAGENT_POLL_MS, pollDelay } from "../../../src/features/conversation/reload.ts";

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
