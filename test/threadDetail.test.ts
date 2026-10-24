import assert from "node:assert/strict";
import { test } from "node:test";
import { toThreadDetail } from "../src/threadDetail.ts";
import type { RawProjection } from "../src/t3/types.ts";

const projection: RawProjection = {
  messages: [
    { id: "m1", role: "user", text: "Hello", createdAt: "2026-03-01T10:00:00Z" },
    { id: "hidden", role: "assistant", text: "internal", createdAt: "2026-03-01T10:00:01Z" },
    { id: "m2", role: "assistant", text: "Hi there", createdAt: "2026-03-01T10:00:02Z", streaming: true },
  ],
  visibleTurnItems: [{ item: { type: "message", messageId: "m1" } }, { item: { type: "message", messageId: "m2" } }],
};

test("keeps visible messages in their original order and defaults streaming to false", () => {
  const detail = toThreadDetail("thread-1", projection, undefined);
  assert.deepEqual(detail.messages, [
    { id: "m1", role: "user", text: "Hello", createdAt: "2026-03-01T10:00:00Z", streaming: false },
    { id: "m2", role: "assistant", text: "Hi there", createdAt: "2026-03-01T10:00:02Z", streaming: true },
  ]);
  assert.equal(detail.threadId, "thread-1");
  assert.equal(detail.thread, null);
});

test("passes the store thread through", () => {
  const thread = { id: "thread-1" } as never;
  assert.equal(toThreadDetail("thread-1", projection, thread).thread, thread);
});

test("an empty projection gives empty lists", () => {
  const detail = toThreadDetail("thread-1", {}, undefined);
  assert.deepEqual([detail.messages, detail.pendingRequests], [[], []]);
});

const withRequests: RawProjection = {
  runtimeRequests: [
    { id: "req-approval", kind: "command", status: "pending", createdAt: "2026-03-01T11:00:00Z", responseCapability: { type: "live" } },
    { id: "req-input", kind: "user_input", status: "pending", createdAt: "2026-03-01T11:01:00Z", responseCapability: { type: "not_resumable" } },
    { id: "req-other", kind: "dynamic_tool_call", status: "pending", createdAt: "2026-03-01T11:02:00Z" },
    { id: "req-orphan", kind: "command", status: "pending", createdAt: "2026-03-01T11:03:00Z", responseCapability: { type: "message" } },
    { id: "req-done", kind: "command", status: "resolved", createdAt: "2026-03-01T11:04:00Z" },
  ],
  turnItems: [
    { item: { type: "approval_request", requestId: "req-approval", requestKind: "command", prompt: "Run ls?", reason: "Needs a listing" } },
    { type: "approval_request", requestId: "req-done", requestKind: "command" },
  ],
  visibleTurnItems: [
    {
      item: {
        type: "user_input_request",
        requestId: "req-input",
        questions: [
          {
            id: "q1",
            header: "Mode",
            question: "Which mode?",
            options: [{ label: "Fast", description: "Quick", value: "fast" }, { label: "Slow" }],
            multiSelect: true,
          },
          { id: "q2", question: "Anything else?", allowCustomAnswer: true, required: true },
        ],
      },
    },
    { item: { type: "something_else", requestId: "req-other" } },
  ],
};

test("joins pending requests with their turn items and leaves resolved ones out", () => {
  const { pendingRequests } = toThreadDetail("thread-1", withRequests, undefined);
  assert.deepEqual(
    pendingRequests.map((request) => request.requestId),
    ["req-approval", "req-input", "req-other", "req-orphan"],
  );
});

test("approval request", () => {
  const request = toThreadDetail("thread-1", withRequests, undefined).pendingRequests[0];
  assert.deepEqual(request, {
    category: "approval",
    requestId: "req-approval",
    requestKind: "command",
    prompt: "Run ls?",
    reason: "Needs a listing",
    resumable: true,
    createdAt: "2026-03-01T11:00:00Z",
  });
});

test("approval prompt and reason default to null", () => {
  const detail = toThreadDetail(
    "thread-1",
    { runtimeRequests: [{ id: "r", kind: "command", status: "pending" }], turnItems: [{ item: { type: "approval_request", requestId: "r", requestKind: "command" } }] },
    undefined,
  );
  const request = detail.pendingRequests[0]!;
  assert.equal(request.category, "approval");
  if (request.category === "approval") assert.deepEqual([request.prompt, request.reason], [null, null]);
});

test("user-input request: value falls back to label, defaults, and not_resumable", () => {
  const request = toThreadDetail("thread-1", withRequests, undefined).pendingRequests[1]!;
  assert.equal(request.category, "user-input");
  assert.equal(request.resumable, false);
  if (request.category !== "user-input") return;
  assert.deepEqual(request.questions, [
    {
      id: "q1",
      header: "Mode",
      question: "Which mode?",
      options: [
        { label: "Fast", description: "Quick", value: "fast" },
        { label: "Slow", description: null, value: "Slow" },
      ],
      multiSelect: true,
      allowCustomAnswer: false,
      required: false,
    },
    { id: "q2", header: null, question: "Anything else?", options: [], multiSelect: false, allowCustomAnswer: true, required: true },
  ]);
});

test("unknown item kind or no matching item gives other", () => {
  const [, , other, orphan] = toThreadDetail("thread-1", withRequests, undefined).pendingRequests;
  assert.deepEqual(other, { category: "other", requestId: "req-other", requestKind: "dynamic_tool_call", resumable: true, createdAt: "2026-03-01T11:02:00Z" });
  assert.deepEqual(orphan, { category: "other", requestId: "req-orphan", requestKind: "command", resumable: true, createdAt: "2026-03-01T11:03:00Z" });
});
