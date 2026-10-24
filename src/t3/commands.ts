import { randomUUID } from "node:crypto";
import type { ApprovalDecision, CreateThreadBody, UserInputAnswers } from "../../shared/api.ts";
import type { Command } from "./types.ts";

type NewId = () => string;

export type DispatchMode = { type: "start_immediately" } | { type: "queue_after_active" } | { type: "steer_active"; targetRunId: string };

const PROVENANCE = { createdBy: "user", creationSource: "server" };

export function createThreadCommands(body: CreateThreadBody, newId: NewId = randomUUID): { threadId: string; commands: Command[] } {
  const threadId = newId();
  const create: Command = {
    type: "thread.create",
    commandId: newId(),
    threadId,
    projectId: body.projectId,
    title: body.title,
    modelSelection: body.modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    ...PROVENANCE,
  };
  const dispatch: Command = {
    ...messageCommand(threadId, body.text, { type: "start_immediately" }, newId),
    modelSelection: body.modelSelection,
  };
  return { threadId, commands: [create, dispatch] };
}

export function messageCommand(threadId: string, text: string, dispatchMode: DispatchMode, newId: NewId = randomUUID): Command {
  return { type: "message.dispatch", commandId: newId(), threadId, messageId: newId(), text, attachments: [], dispatchMode, ...PROVENANCE };
}

export const archiveCommand = (threadId: string, newId: NewId = randomUUID): Command => ({ type: "thread.archive", commandId: newId(), threadId });
export const pinCommand = (threadId: string, newId: NewId = randomUUID): Command => ({ type: "thread.pin", commandId: newId(), threadId });
export const unpinCommand = (threadId: string, newId: NewId = randomUUID): Command => ({ type: "thread.unpin", commandId: newId(), threadId });

// holdQueue keeps queued messages from starting a new run right after the stop.
export const interruptCommand = (threadId: string, runId: string, newId: NewId = randomUUID): Command => ({
  type: "run.interrupt",
  commandId: newId(),
  threadId,
  runId,
  holdQueue: true,
});

export const approvalCommand = (threadId: string, requestId: string, decision: ApprovalDecision, newId: NewId = randomUUID): Command => ({
  type: "runtime-request.respond",
  commandId: newId(),
  threadId,
  requestId,
  decision,
});

export const userInputCommand = (threadId: string, requestId: string, answers: UserInputAnswers, newId: NewId = randomUUID): Command => ({
  type: "runtime-request.respond",
  commandId: newId(),
  threadId,
  requestId,
  answers,
});

export const dismissCommand = (threadId: string, requestId: string, newId: NewId = randomUUID): Command => ({
  type: "thread.user-input.dismiss",
  commandId: newId(),
  threadId,
  requestId,
});
