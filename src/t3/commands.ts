import { randomUUID } from "node:crypto";
import type { ApprovalDecision, CreateThreadBody, ModelSelection, RuntimeMode, UserInputAnswers } from "../../shared/api.ts";
import type { Command } from "./types.ts";

type NewId = () => string;

export type DispatchMode = { type: "start_immediately" } | { type: "queue_after_active" } | { type: "steer_active"; targetRunId: string };

const PROVENANCE = { createdBy: "user", creationSource: "server" };

export const RUNTIME_MODES: RuntimeMode[] = ["approval-required", "auto-accept-edits", "auto", "full-access"];
export const isRuntimeMode = (value: unknown): value is RuntimeMode => RUNTIME_MODES.includes(value as RuntimeMode);

// Images are persisted before the thread exists, so their caller picks the thread id.
export function createThreadCommands(
  body: Omit<CreateThreadBody, "attachments">,
  newId: NewId = randomUUID,
  start?: { threadId: string; upload: MessageAttachments },
): { threadId: string; commands: Command[] } {
  const threadId = start?.threadId ?? newId();
  const create: Command = {
    type: "thread.create",
    commandId: newId(),
    threadId,
    projectId: body.projectId,
    title: body.title,
    modelSelection: body.modelSelection,
    runtimeMode: body.runtimeMode ?? "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    ...PROVENANCE,
  };
  const dispatch: Command = {
    ...messageCommand(threadId, body.text, { type: "start_immediately" }, newId, start?.upload),
    modelSelection: body.modelSelection,
  };
  return { threadId, commands: [create, dispatch] };
}

// Attachments are persisted under a message id first, so that id must be reused here.
export interface MessageAttachments {
  messageId: string;
  attachments: unknown[];
}

// `steer` lets T3 pick the active run itself, so a run that starts or ends meanwhile cannot make it fail.
export function messageCommand(threadId: string, text: string, dispatchMode: DispatchMode, newId: NewId = randomUUID, upload?: MessageAttachments, deliveryIntent?: "steer"): Command {
  const commandId = newId();
  const { messageId, attachments } = upload ?? { messageId: newId(), attachments: [] };
  return { type: "message.dispatch", commandId, threadId, messageId, text, attachments, dispatchMode, ...(deliveryIntent && { deliveryIntent }), ...PROVENANCE };
}

// T3 resolves a provider switch itself when the instance changes (serverResolvedCommandContext).
export const modelSelectionCommand = (threadId: string, modelSelection: ModelSelection, newId: NewId = randomUUID): Command => ({
  type: "thread.model-selection.set",
  commandId: newId(),
  threadId,
  modelSelection,
});

export const runtimeModeCommand = (threadId: string, runtimeMode: RuntimeMode, newId: NewId = randomUUID): Command => ({
  type: "thread.runtime-mode.set",
  commandId: newId(),
  threadId,
  runtimeMode,
});

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
