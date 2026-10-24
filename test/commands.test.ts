import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvalCommand,
  archiveCommand,
  createThreadCommands,
  dismissCommand,
  interruptCommand,
  messageCommand,
  pinCommand,
  unpinCommand,
  userInputCommand,
} from "../src/t3/commands.ts";

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
  assert.deepEqual(messageCommand("thread-1", "Hi", { type: "steer_active", targetRunId: "run-1" }, counter()), {
    type: "message.dispatch",
    commandId: "id-1",
    threadId: "thread-1",
    messageId: "id-2",
    text: "Hi",
    attachments: [],
    dispatchMode: { type: "steer_active", targetRunId: "run-1" },
    createdBy: "user",
    creationSource: "server",
  });
});

test("archive, pin and unpin commands", () => {
  assert.deepEqual(archiveCommand("thread-1", counter()), { type: "thread.archive", commandId: "id-1", threadId: "thread-1" });
  assert.deepEqual(pinCommand("thread-1", counter()), { type: "thread.pin", commandId: "id-1", threadId: "thread-1" });
  assert.deepEqual(unpinCommand("thread-1", counter()), { type: "thread.unpin", commandId: "id-1", threadId: "thread-1" });
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
    archiveCommand("t", counter()),
    approvalCommand("t", "r", "accept", counter()),
    userInputCommand("t", "r", {}, counter()),
    dismissCommand("t", "r", counter()),
  ];
  assert.ok(!JSON.stringify(all).includes("acceptAlways"));
});
