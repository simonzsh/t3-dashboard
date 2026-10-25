import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  approvalCommand,
  createThreadCommands,
  dismissCommand,
  interruptCommand,
  messageCommand,
  modelSelectionCommand,
  runtimeModeCommand,
  userInputCommand,
} from "../../../src/integrations/t3/commands.ts";

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const model = { instanceId: "provider-a", model: "model-x" };

test("createThreadCommands builds thread.create then message.dispatch", () => {
  const { threadId, commands } = createThreadCommands({ projectId: "project-1", title: "Thread 1", text: "Hello", modelSelection: model }, counter());
  assert.equal(threadId, "id-1");
  assert.deepEqual(commands, [
    {
      type: "thread.create",
      commandId: "id-2",
      threadId: "id-1",
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
      commandId: "id-3",
      threadId: "id-1",
      messageId: "id-4",
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
  assert.deepEqual(messageCommand("thread-1", "Hi", { type: "queue_after_active" }, counter()), {
    type: "message.dispatch",
    commandId: "id-1",
    threadId: "thread-1",
    messageId: "id-2",
    text: "Hi",
    attachments: [],
    dispatchMode: { type: "queue_after_active" },
    createdBy: "user",
    creationSource: "server",
  });
});

test("run.interrupt holds the queue", () => {
  assert.deepEqual(interruptCommand("thread-1", "run-1", counter()), {
    type: "run.interrupt",
    commandId: "id-1",
    threadId: "thread-1",
    runId: "run-1",
    holdQueue: true,
  });
});

test("approvalCommand sends the decision", () => {
  for (const decision of ["accept", "acceptForSession", "decline"] as const) {
    assert.deepEqual(approvalCommand("thread-1", "req-1", decision, counter()), {
      type: "runtime-request.respond",
      commandId: "id-1",
      threadId: "thread-1",
      requestId: "req-1",
      decision,
    });
  }
});

test("userInputCommand sends the answers and no decision", () => {
  assert.deepEqual(userInputCommand("thread-1", "req-1", { q1: "a", q2: ["b", "c"] }, counter()), {
    type: "runtime-request.respond",
    commandId: "id-1",
    threadId: "thread-1",
    requestId: "req-1",
    answers: { q1: "a", q2: ["b", "c"] },
  });
});

test("messageCommand carries persisted attachments under the given message id", () => {
  const image = { type: "image", id: "img-1", name: "a.png", mimeType: "image/png", sizeBytes: 3 };
  const command = messageCommand("thread-1", "Look", { type: "queue_after_active" }, counter(), { messageId: "msg-9", attachments: [image] });
  assert.equal(command.messageId, "msg-9");
  assert.equal(command.commandId, "id-1");
  assert.deepEqual(command.attachments, [image]);
});

test("modelSelectionCommand and runtimeModeCommand", () => {
  const selection = { ...model, options: [{ id: "effort", value: "high" }] };
  assert.deepEqual(modelSelectionCommand("thread-1", selection, counter()), { type: "thread.model-selection.set", commandId: "id-1", threadId: "thread-1", modelSelection: selection });
  assert.deepEqual(runtimeModeCommand("thread-1", "approval-required", counter()), { type: "thread.runtime-mode.set", commandId: "id-1", threadId: "thread-1", runtimeMode: "approval-required" });
});

test("dismissCommand", () => {
  assert.deepEqual(dismissCommand("thread-1", "req-1", counter()), {
    type: "thread.user-input.dismiss",
    commandId: "id-1",
    threadId: "thread-1",
    requestId: "req-1",
  });
});

test("no builder produces acceptAlways", () => {
  const all = [
    ...createThreadCommands({ projectId: "p", title: "t", text: "x", modelSelection: model }, counter()).commands,
    approvalCommand("t", "r", "accept", counter()),
    userInputCommand("t", "r", {}, counter()),
    dismissCommand("t", "r", counter()),
  ];
  assert.ok(!JSON.stringify(all).includes("acceptAlways"));
});
