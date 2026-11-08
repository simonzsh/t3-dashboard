import type { ApprovalDecision, CreateThreadBody, ModelSelection, RuntimeMode, UserInputAnswers, WorkspaceChoice } from "../../../shared/api.ts";
import type { Command, LaunchThread, WorkspaceStrategy } from "./schemas.ts";

export type DispatchMode = { type: "start_immediately" } | { type: "queue_after_active" };

// Builders leave out `commandId`: the sender stamps it.
export type UnsentCommand = Omit<Command, "commandId">;

const PROVENANCE = { createdBy: "user", creationSource: "server" };

// Attachments are persisted under a message id first, so that id must be reused here.
export interface OutgoingMessage {
  messageId: string;
  attachments: unknown[];
}

// T3 treats a worktree equal to the project folder as the plain checkout.
const sameFolder = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

// `resolvedBranch` is the name T3 gave after a checkout or a branch creation: it replaces the typed one.
export function workspaceStrategy(choice: WorkspaceChoice | undefined, resolvedBranch: string | null, workspaceRoot: string | undefined): WorkspaceStrategy {
  if (!choice) return { type: "root" };
  if (choice.type === "worktree") return { type: "worktree", baseRef: choice.baseRef, ...(choice.startFromOrigin && { startFromOrigin: true }) };
  if (choice.type === "existing_worktree") {
    const branch = choice.branch === undefined ? {} : { branch: choice.branch };
    return workspaceRoot !== undefined && sameFolder(choice.worktreePath, workspaceRoot) ? { type: "root", ...branch } : { type: "existing_worktree", worktreePath: choice.worktreePath, ...branch };
  }
  const branch = resolvedBranch ?? choice.branch;
  return branch === undefined ? { type: "root" } : { type: "root", branch };
}

// `generateTitle` makes T3 ask the model for a title, with `title` as the seed, like its own client.
export function launchPayload(threadId: string, body: Omit<CreateThreadBody, "attachments" | "uploads" | "workspace">, message: OutgoingMessage, strategy: WorkspaceStrategy, options: { generateTitle: boolean }): LaunchThread {
  return {
    threadId,
    projectId: body.projectId,
    title: body.title,
    generateTitle: options.generateTitle,
    modelSelection: body.modelSelection,
    runtimeMode: body.runtimeMode ?? "full-access",
    interactionMode: "default",
    workspaceStrategy: strategy,
    initialMessage: { messageId: message.messageId, text: body.text, attachments: message.attachments },
  };
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

export const renameThreadCommand = (threadId: string, title: string): UnsentCommand => ({ type: "thread.metadata.update", threadId, title });

// T3 resolves a provider switch itself when the instance changes (serverResolvedCommandContext).
export const modelSelectionCommand = (threadId: string, modelSelection: ModelSelection): UnsentCommand => ({ type: "thread.model-selection.set", threadId, modelSelection });

export const runtimeModeCommand = (threadId: string, runtimeMode: RuntimeMode): UnsentCommand => ({ type: "thread.runtime-mode.set", threadId, runtimeMode });

// holdQueue keeps queued messages from starting a new run right after the stop.
export const interruptCommand = (threadId: string, runId: string): UnsentCommand => ({ type: "run.interrupt", threadId, runId, holdQueue: true });

// T3 names the queued run `queuedRunId` here and `runId` in the other queue commands.
export const promoteQueuedCommand = (threadId: string, queuedRunId: string, targetRunId: string): UnsentCommand => ({ type: "queued-message.promote-to-steer", threadId, queuedRunId, targetRunId });

// "Send now" while no run is active.
export const startQueuedCommand = (threadId: string, runId: string): UnsentCommand => ({ type: "queued-run.start", threadId, runId });

// No `attachments` key: T3 then keeps the stored ones, like its own client.
export const editQueuedCommand = (threadId: string, runId: string, text: string): UnsentCommand => ({ type: "queued-run.edit", threadId, runId, text });

export const cancelQueuedCommand = (threadId: string, runId: string): UnsentCommand => ({ type: "queued-run.cancel", threadId, runId });

export const subagentStopCommand = (threadId: string, runId: string, subagentId: string): UnsentCommand => ({ type: "subagent.stop", threadId, runId, subagentId });

// Stops a delegated task's own thread, whatever its run: only T3 builds with the threadStop capability know it.
export const threadStopCommand = (threadId: string): UnsentCommand => ({ type: "thread.stop", threadId });

export const approvalCommand = (threadId: string, requestId: string, decision: ApprovalDecision): UnsentCommand => ({ type: "runtime-request.respond", threadId, requestId, decision });

export const userInputCommand = (threadId: string, requestId: string, answers: UserInputAnswers): UnsentCommand => ({ type: "runtime-request.respond", threadId, requestId, answers });

// Same as the Settle action of the T3 Code sidebar; T3 refuses it while the thread runs or waits.
export const settleCommand = (threadId: string): UnsentCommand => ({ type: "thread.settle", threadId });

export const archiveThreadCommand = (threadId: string): UnsentCommand => ({ type: "thread.archive", threadId });

export const unsettleCommand = (threadId: string): UnsentCommand => ({ type: "thread.unsettle", threadId, reason: "user" });

export const dismissCommand = (threadId: string, requestId: string): UnsentCommand => ({ type: "thread.user-input.dismiss", threadId, requestId });

// Rewinds the thread to a checkpoint, the way "Edit from here" does in T3 Code; restoreFiles also undoes file edits.
export const rollbackCommand = (threadId: string, checkpoint: { scopeId: string; checkpointId: string }, restoreFiles: boolean): UnsentCommand => ({
  type: "checkpoint.rollback",
  threadId,
  scopeId: checkpoint.scopeId,
  checkpointId: checkpoint.checkpointId,
  restoreFiles,
});
