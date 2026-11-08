import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  approvalCommand,
  cancelQueuedCommand,
  editQueuedCommand,
  promoteQueuedCommand,
  startQueuedCommand,
  dismissCommand,
  settleCommand,
  unsettleCommand,
  rollbackCommand,
  interruptCommand,
  launchPayload,
  messageCommand,
  modelSelectionCommand,
  renameThreadCommand,
  runtimeModeCommand,
  subagentStopCommand,
  threadStopCommand,
  userInputCommand,
  workspaceStrategy,
} from "../../../src/integrations/t3/commands.ts";

const model = { instanceId: "provider-a", model: "model-x" };
const plain = { messageId: "msg-1", attachments: [] };

test("launchPayload builds the launchThread payload with defaults", () => {
  const body = { projectId: "project-1", title: "Thread 1", text: "Hello", modelSelection: model };
  assert.deepEqual(launchPayload("thread-1", body, plain, { type: "root" }, { generateTitle: true }), {
    threadId: "thread-1",
    projectId: "project-1",
    title: "Thread 1",
    generateTitle: true,
    modelSelection: model,
    runtimeMode: "full-access",
    interactionMode: "default",
    workspaceStrategy: { type: "root" },
    initialMessage: { messageId: "msg-1", text: "Hello", attachments: [] },
  });
});

test("launchPayload carries the runtime and interaction modes, the strategy and the attachments", () => {
  const body = { projectId: "p", title: "t", text: "x", modelSelection: model, runtimeMode: "approval-required" as const, interactionMode: "plan" as const };
  const strategy = { type: "worktree" as const, baseRef: "main" };
  const message = { messageId: "msg-2", attachments: [{ id: "a" }] };
  const payload = launchPayload("thread-1", body, message, strategy, { generateTitle: false });
  assert.equal(payload.generateTitle, false);
  assert.equal(payload.runtimeMode, "approval-required");
  assert.equal(payload.interactionMode, "plan");
  assert.deepEqual(payload.workspaceStrategy, strategy);
  assert.deepEqual(payload.initialMessage.attachments, [{ id: "a" }]);
});

test("workspaceStrategy defaults to the root and keeps a resolved branch", () => {
  assert.deepEqual(workspaceStrategy(undefined, null, "/repo"), { type: "root" });
  assert.deepEqual(workspaceStrategy({ type: "root" }, null, "/repo"), { type: "root" });
  assert.deepEqual(workspaceStrategy({ type: "root", branch: "feature x" }, "feature-x", "/repo"), { type: "root", branch: "feature-x" });
  assert.deepEqual(workspaceStrategy({ type: "root", branch: "feature", create: true }, "feature", "/repo"), { type: "root", branch: "feature" });
});

test("workspaceStrategy reuses another worktree, but the project folder itself is the root", () => {
  assert.deepEqual(workspaceStrategy({ type: "existing_worktree", worktreePath: "/wt/a", branch: "a" }, null, "/repo"), { type: "existing_worktree", worktreePath: "/wt/a", branch: "a" });
  assert.deepEqual(workspaceStrategy({ type: "existing_worktree", worktreePath: "/repo", branch: "main" }, null, "/repo"), { type: "root", branch: "main" });
  assert.deepEqual(workspaceStrategy({ type: "existing_worktree", worktreePath: "/repo/", branch: "main" }, null, "/repo"), { type: "root", branch: "main" });
});

test("workspaceStrategy sends a worktree choice as T3 expects", () => {
  assert.deepEqual(workspaceStrategy({ type: "worktree", baseRef: "main" }, null, "/repo"), { type: "worktree", baseRef: "main" });
  assert.deepEqual(workspaceStrategy({ type: "worktree", baseRef: "origin/main", startFromOrigin: true }, null, "/repo"), { type: "worktree", baseRef: "origin/main", startFromOrigin: true });
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

test("subagent.stop names the parent thread, the run and the subagent", () => {
  assert.deepEqual(subagentStopCommand("thread-1", "run-1", "sub-1"), { type: "subagent.stop", threadId: "thread-1", runId: "run-1", subagentId: "sub-1" });
});

test("thread.stop names only the thread", () => {
  assert.deepEqual(threadStopCommand("child-1"), { type: "thread.stop", threadId: "child-1" });
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

test("rollbackCommand names the checkpoint and whether files return", () => {
  assert.deepEqual(rollbackCommand("thread-1", { scopeId: "scope-1", checkpointId: "cp-1" }, true), { type: "checkpoint.rollback", threadId: "thread-1", scopeId: "scope-1", checkpointId: "cp-1", restoreFiles: true });
  assert.equal(rollbackCommand("thread-1", { scopeId: "scope-1", checkpointId: "cp-1" }, false).restoreFiles, false);
});

test("renameThreadCommand sets the thread title only", () => {
  assert.deepEqual(renameThreadCommand("thread-1", "New name"), { type: "thread.metadata.update", threadId: "thread-1", title: "New name" });
});

test("no builder produces acceptAlways", () => {
  const all = [
    approvalCommand("t", "r", "accept"),
    userInputCommand("t", "r", {}),
    dismissCommand("t", "r"),
  ];
  assert.ok(!JSON.stringify(all).includes("acceptAlways"));
});

test("queue commands use T3's field names: queuedRunId only for the promotion", () => {
  assert.deepEqual(promoteQueuedCommand("t", "q1", "r1"), { type: "queued-message.promote-to-steer", threadId: "t", queuedRunId: "q1", targetRunId: "r1" });
  assert.deepEqual(startQueuedCommand("t", "q1"), { type: "queued-run.start", threadId: "t", runId: "q1" });
  assert.deepEqual(cancelQueuedCommand("t", "q1"), { type: "queued-run.cancel", threadId: "t", runId: "q1" });
});

test("editing a queued message sends the text and no attachments key", () => {
  const command = editQueuedCommand("t", "q1", "new");
  assert.deepEqual(command, { type: "queued-run.edit", threadId: "t", runId: "q1", text: "new" });
  assert.equal("attachments" in command, false);
});
