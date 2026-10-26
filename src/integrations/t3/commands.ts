import type { ApprovalDecision, CreateThreadBody, ModelSelection, RuntimeMode, UserInputAnswers } from "../../../shared/api.ts";
import type { Command } from "./schemas.ts";

export type DispatchMode = { type: "start_immediately" } | { type: "queue_after_active" };

// Builders leave out `commandId`: the sender stamps it.
export type UnsentCommand = Omit<Command, "commandId">;

const PROVENANCE = { createdBy: "user", creationSource: "server" };

// Attachments are persisted under a message id first, so that id must be reused here.
export interface OutgoingMessage {
  messageId: string;
  attachments: unknown[];
}

export function createThreadCommands(threadId: string, body: Omit<CreateThreadBody, "attachments">, message: OutgoingMessage): UnsentCommand[] {
  const create = {
    type: "thread.create",
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
  const dispatch = { ...messageCommand(threadId, body.text, message, { mode: { type: "start_immediately" } }), modelSelection: body.modelSelection };
  return [create, dispatch];
}

// `steer` lets T3 pick the active run itself, so a run that starts or ends meanwhile cannot make it fail.
export function messageCommand(threadId: string, text: string, message: OutgoingMessage, options: { mode: DispatchMode; steer?: boolean }): UnsentCommand {
  const { messageId, attachments } = message;
  return {
    type: "message.dispatch",
    threadId,
    messageId,
    text,
    attachments,
    dispatchMode: options.mode,
    ...(options.steer && { deliveryIntent: "steer" }),
    ...PROVENANCE,
  };
}

// T3 resolves a provider switch itself when the instance changes (serverResolvedCommandContext).
export const modelSelectionCommand = (threadId: string, modelSelection: ModelSelection): UnsentCommand => ({ type: "thread.model-selection.set", threadId, modelSelection });

export const runtimeModeCommand = (threadId: string, runtimeMode: RuntimeMode): UnsentCommand => ({ type: "thread.runtime-mode.set", threadId, runtimeMode });

// holdQueue keeps queued messages from starting a new run right after the stop.
export const interruptCommand = (threadId: string, runId: string): UnsentCommand => ({ type: "run.interrupt", threadId, runId, holdQueue: true });

export const subagentStopCommand = (threadId: string, runId: string, subagentId: string): UnsentCommand => ({ type: "subagent.stop", threadId, runId, subagentId });

// Stops a delegated task's own thread, whatever its run: only T3 builds with the threadStop capability know it.
export const threadStopCommand = (threadId: string): UnsentCommand => ({ type: "thread.stop", threadId });

export const approvalCommand = (threadId: string, requestId: string, decision: ApprovalDecision): UnsentCommand => ({ type: "runtime-request.respond", threadId, requestId, decision });

export const userInputCommand = (threadId: string, requestId: string, answers: UserInputAnswers): UnsentCommand => ({ type: "runtime-request.respond", threadId, requestId, answers });

// Same as the Settle action of the T3 Code sidebar; T3 refuses it while the thread runs or waits.
export const settleCommand = (threadId: string): UnsentCommand => ({ type: "thread.settle", threadId });

export const unsettleCommand = (threadId: string): UnsentCommand => ({ type: "thread.unsettle", threadId, reason: "user" });

export const dismissCommand = (threadId: string, requestId: string): UnsentCommand => ({ type: "thread.user-input.dismiss", threadId, requestId });
