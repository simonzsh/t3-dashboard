import assert from "node:assert/strict";
import { test } from "bun:test";
import type { ChatMessage } from "../../../../shared/api.ts";
import { PENDING_MAX_MS, isSettled, pendingLabel } from "../../../src/features/conversation/pending.ts";

const SENT = Date.parse("2026-01-01T10:00:00.000Z");
const msg = (role: ChatMessage["role"], text: string, createdAt: string): ChatMessage => ({ id: `${role}-${createdAt}`, role, text, createdAt, streaming: false, attachments: [], runId: null });
const pending = { id: "p1", text: "hello", images: 0, sentAt: SENT, baseline: 0 };

test("a pending message is settled once a new user message has the same text, whatever its clock", () => {
  const messages = [msg("user", "hello", "2026-01-01T09:59:00.000Z")];
  assert.equal(isSettled(pending, messages, SENT + 2000), true);
});

test("a message with the same text that was already there does not settle it", () => {
  const messages = [msg("user", "hello", "2026-01-01T09:00:00.000Z")];
  assert.equal(isSettled({ ...pending, baseline: 1 }, messages, SENT + 2000), false);
});

test("other text or another role does not settle it", () => {
  const messages = [msg("user", "bye", "2026-01-01T10:00:01.000Z"), msg("assistant", "hello", "2026-01-01T10:00:01.000Z")];
  assert.equal(isSettled(pending, messages, SENT + 2000), false);
});

test("a pending message expires after the maximum delay", () => {
  assert.equal(isSettled(pending, [], SENT + PENDING_MAX_MS - 1), false);
  assert.equal(isSettled(pending, [], SENT + PENDING_MAX_MS), true);
});

test("the label counts images", () => {
  assert.equal(pendingLabel(0), "Sending…");
  assert.equal(pendingLabel(1), "Sending… · 1 image");
  assert.equal(pendingLabel(3), "Sending… · 3 images");
});
