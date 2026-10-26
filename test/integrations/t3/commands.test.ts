import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  approvalCommand,
  createThreadCommands,
  dismissCommand,
  settleCommand,
  unsettleCommand,
  interruptCommand,
  messageCommand,
  modelSelectionCommand,
  runtimeModeCommand,
  userInputCommand,
} from "../../../src/integrations/t3/commands.ts";

const model = { instanceId: "provider-a", model: "model-x" };
const plain = { messageId: "msg-1", attachments: [] };

test("createThreadCommands builds thread.create then message.dispatch", () => {
  const commands = createThreadCommands("thread-1", { projectId: "project-1", title: "Thread 1", text: "Hello", modelSelection: model }, plain);
  assert.deepEqual(commands, [
    {
      type: "thread.create",
      threadId: "thread-1",
      projectId: "project-1",
      title: "Thread 1",
      modelSelection: model,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "server",
    },
    {
      type: "message.dispatch",
      threadId: "thread-1",
      messageId: "msg-1",
      text: "Hello",
      attachments: [],
      modelSelection: model,
      dispatchMode: { type: "start_immediately" },
      createdBy: "user",
      creationSource: "server",
    },
  ]);
});

test("messageCommand carries the dispatch mode", () => {
  assert.deepEqual(messageCommand("thread-1", "Hi", plain, { mode: { type: "queue_after_active" } }), {
    type: "message.dispatch",
    threadId: "thread-1",
    messageId: "msg-1",
    text: "Hi",
    attachments: [],
    dispatchMode: { type: "queue_after_active" },
    createdBy: "user",
    creationSource: "server",
  });
});

test("messageCommand asks T3 to steer only when told to", () => {
  assert.equal(messageCommand("thread-1", "Hi", plain, { mode: { type: "start_immediately" }, steer: true }).deliveryIntent, "steer");
  assert.ok(!("deliveryIntent" in messageCommand("thread-1", "Hi", plain, { mode: { type: "start_immediately" }, steer: false })));
});

test("run.interrupt holds the queue", () => {
  assert.deepEqual(interruptCommand("thread-1", "run-1"), { type: "run.interrupt", threadId: "thread-1", runId: "run-1", holdQueue: true });
});

test("approvalCommand sends the decision", () => {
  for (const decision of ["accept", "acceptForSession", "decline"] as const) {
    assert.deepEqual(approvalCommand("thread-1", "req-1", decision), { type: "runtime-request.respond", threadId: "thread-1", requestId: "req-1", decision });
  }
});

test("userInputCommand sends the answers and no decision", () => {
  assert.deepEqual(userInputCommand("thread-1", "req-1", { q1: "a", q2: ["b", "c"] }), {
    type: "runtime-request.respond",
    threadId: "thread-1",
    requestId: "req-1",
    answers: { q1: "a", q2: ["b", "c"] },
  });
});

test("messageCommand carries persisted attachments under the given message id", () => {
  const image = { type: "image", id: "img-1", name: "a.png", mimeType: "image/png", sizeBytes: 3 };
  const command = messageCommand("thread-1", "Look", { messageId: "msg-9", attachments: [image] }, { mode: { type: "queue_after_active" } });
  assert.equal(command.messageId, "msg-9");
  assert.deepEqual(command.attachments, [image]);
});

test("modelSelectionCommand and runtimeModeCommand", () => {
  const selection = { ...model, options: [{ id: "effort", value: "high" }] };
  assert.deepEqual(modelSelectionCommand("thread-1", selection), { type: "thread.model-selection.set", threadId: "thread-1", modelSelection: selection });
  assert.deepEqual(runtimeModeCommand("thread-1", "approval-required"), { type: "thread.runtime-mode.set", threadId: "thread-1", runtimeMode: "approval-required" });
});

test("dismissCommand", () => {
  assert.deepEqual(dismissCommand("thread-1", "req-1"), { type: "thread.user-input.dismiss", threadId: "thread-1", requestId: "req-1" });
});

test("settleCommand", () => {
  assert.deepEqual(settleCommand("thread-1"), { type: "thread.settle", threadId: "thread-1" });
});

test("unsettleCommand", () => {
  assert.deepEqual(unsettleCommand("thread-1"), { type: "thread.unsettle", threadId: "thread-1", reason: "user" });
});

test("no builder produces acceptAlways", () => {
  const all = [
    ...createThreadCommands("t", { projectId: "p", title: "t", text: "x", modelSelection: model }, plain),
    approvalCommand("t", "r", "accept"),
    userInputCommand("t", "r", {}),
    dismissCommand("t", "r"),
  ];
  assert.ok(!JSON.stringify(all).includes("acceptAlways"));
});
