import { marked } from "marked";
import type { AssignIssueBody, CreateThreadBody, LinearIssue, ModelSelection, RespondBody, SendMessageBody, ThreadDetail, ThreadSearchResult, ThreadSettingsBody } from "../../shared/api.ts";
import { ACTIVE_STATUSES, RUNNING_RUN_STATUSES } from "../../shared/status.ts";
import { IntegrationError } from "../integrations/errors.ts";
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
  type DispatchMode,
  type OutgoingMessage,
  type UnsentCommand,
} from "../integrations/t3/commands.ts";
import type { AssetResource, ImageUpload, T3Port } from "../integrations/t3/schemas.ts";
import { DomainError } from "./errors.ts";
import type { LinearBoard } from "./linearBoard.ts";
import type { ShellStore } from "./shellStore.ts";
import { toThreadDetail } from "./threadDetail.ts";

export type { ImageUpload };


export interface ActionsOptions {
  port: T3Port;
  store: Pick<ShellStore, "thread" | "project" | "backgroundTasks">;
  board: Pick<LinearBoard, "get">;
  newId?: () => string;
}

/** What the user can do to T3 threads from the dashboard. */
export interface Actions {
  threadDetail(threadId: string): Promise<ThreadDetail>;
  /** Message matches in threads the dashboard lists, in T3's order. */
  searchThreads(query: string, limit?: number): Promise<ThreadSearchResult>;
  createThread(create: CreateThreadBody, images: ImageUpload[]): Promise<string>;
  sendMessage(threadId: string, body: Omit<SendMessageBody, "attachments">, images: ImageUpload[]): Promise<void>;
  changeSettings(threadId: string, settings: ThreadSettingsBody): Promise<void>;
  interrupt(threadId: string): Promise<void>;
  respond(threadId: string, requestId: string, answer: RespondBody): Promise<void>;
  dismiss(threadId: string, requestId: string): Promise<void>;
  settle(threadId: string): Promise<void>;
  unsettle(threadId: string): Promise<void>;
  assign(body: Omit<AssignIssueBody, "attachments">, images: ImageUpload[]): Promise<string>;
  /** An image or page of the thread, fetched from T3. */
  asset(threadId: string, request: AssetRequest, range?: string): Promise<{ response: Response; html: boolean }>;
}

export type AssetRequest = { attachmentId: string } | { path: string };

const MEDIA_FILE = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mov)$/i;
const ATTACHMENT_ID = /^[\w-]+$/;

// Same lexer as the web view: only a real `![alt](path)` counts, not any text in parentheses.
function citesImage(text: string | undefined, path: string): boolean {
  if (!text) return false;
  let found = false;
  marked.walkTokens(marked.lexer(text, { gfm: true }), (token) => {
    if (token.type === "image" && token.href === path) found = true;
  });
  return found;
}

export function createActions(options: ActionsOptions): Actions {
  const { port, store, board } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());

  // Every T3 failure is a T3 error, even one a fake port throws as a plain Error.
  const t3 = async <T>(work: Promise<T>): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError((error as Error).message, { system: "t3", kind: "unreachable" });
    }
  };
  const send = async (...commands: UnsentCommand[]) => {
    for (const command of commands) await t3(port.dispatch({ ...command, commandId: newId() }));
  };
  // Images are persisted before the dispatch, under the message id it will carry.
  const outgoing = async (threadId: string, images: ImageUpload[]): Promise<OutgoingMessage> => {
    const messageId = newId();
    return { messageId, attachments: images.length ? await t3(port.persistAttachments(threadId, messageId, images)) : [] };
  };

  // The shell can lag behind a run start: the projection then knows the run first.
  async function activeRunId(threadId: string): Promise<string | null> {
    const runId = store.thread(threadId)?.activeRunId;
    if (runId) return runId;
    const { runs = [] } = await t3(port.threadProjection(threadId));
    return runs.findLast((run) => RUNNING_RUN_STATUSES.has(run.status ?? ""))?.id ?? null;
  }

  async function findIssue(issueId: string): Promise<LinearIssue> {
    let result = await board.get(false);
    let issue = result.issues.find((entry) => entry.id === issueId);
    if (!issue) {
      result = await board.get(true);
      issue = result.issues.find((entry) => entry.id === issueId);
    }
    if (issue) return issue;
    if (!result.ok) throw new IntegrationError(result.error ?? "Linear error", { system: "linear", kind: "unreachable" });
    throw new DomainError("not-found", "Unknown issue");
  }

  return {
    async searchThreads(query, limit) {
      const matches = await t3(port.searchThreads(query, limit));
      return { matches: matches.filter((match) => store.thread(match.threadId)) };
    },

    async threadDetail(threadId) {
      return toThreadDetail(threadId, await t3(port.threadProjection(threadId)), store.thread(threadId), store.backgroundTasks(threadId));
    },

    // T3 signs any readable file: only serve images and videos the thread itself shows.
    async asset(threadId, request, range) {
      let resource: AssetResource;
      if ("attachmentId" in request) {
        if (!ATTACHMENT_ID.test(request.attachmentId) || !request.attachmentId.startsWith(`${threadId}-`)) throw new DomainError("not-found", "No such attachment in this thread");
        resource = { _tag: "attachment", attachmentId: request.attachmentId };
      } else {
        const { path } = request;
        if (!path.startsWith("/") || !MEDIA_FILE.test(path) || path.includes("/../") || /[\0-\x1f]/.test(path)) throw new DomainError("invalid", "Only images and videos can be shown");
        const projection = await t3(port.threadProjection(threadId));
        if (!(projection.messages ?? []).some((message) => message.role === "assistant" && citesImage(message.text, path))) throw new DomainError("not-found", "This thread does not show that image");
        resource = { _tag: "media-file", threadId, path };
      }
      const { response, fileName } = await t3(port.fetchAsset(resource, range));
      return { response, html: resource._tag === "attachment" && fileName.endsWith(".html") };
    },

    async createThread(create, images) {
      const threadId = newId();
      const projectId = create.projectId || (await t3(port.ensureScratchProject()));
      await send(...createThreadCommands(threadId, { ...create, projectId }, await outgoing(threadId, images)));
      return threadId;
    },

    async sendMessage(threadId, body, images) {
      const thread = store.thread(threadId);
      const active = thread !== undefined && ACTIVE_STATUSES.has(thread.status);
      const steer = body.mode === "steer";
      const dispatchMode: DispatchMode = active && !steer ? { type: "queue_after_active" } : { type: "start_immediately" };
      await send(messageCommand(threadId, body.text, await outgoing(threadId, images), { mode: dispatchMode, steer }));
    },

    async changeSettings(threadId, settings) {
      if (settings.modelSelection) await send(modelSelectionCommand(threadId, settings.modelSelection));
      if (settings.runtimeMode) await send(runtimeModeCommand(threadId, settings.runtimeMode));
    },

    async interrupt(threadId) {
      const runId = await activeRunId(threadId);
      if (!runId) throw new DomainError("conflict", "No active run to interrupt");
      await send(interruptCommand(threadId, runId));
    },

    async respond(threadId, requestId, answer) {
      await send("decision" in answer ? approvalCommand(threadId, requestId, answer.decision) : userInputCommand(threadId, requestId, answer.answers));
    },

    async dismiss(threadId, requestId) {
      await send(dismissCommand(threadId, requestId));
    },

    async settle(threadId) {
      await send(settleCommand(threadId));
    },

    async unsettle(threadId) {
      await send(unsettleCommand(threadId));
    },

    async assign(body, images) {
      const issue = await findIssue(body.issueId);
      let projectId: string;
      if (body.projectId) {
        const project = store.project(body.projectId);
        if (!project) throw new DomainError("conflict", "T3 project not found");
        projectId = project.id;
      } else projectId = await t3(port.ensureScratchProject());
      // The agent always gets the issue link, after the user's own instructions if any.
      const reference = `Ticket Linear ${issue.identifier} : ${issue.url}`;
      const instructions = body.text.trim();
      const text = instructions ? `${instructions}\n\n${reference}` : `Traite le ticket Linear ${issue.identifier} : ${issue.url}`;
      const create = { projectId, title: `${issue.identifier} ${issue.title}`, text, modelSelection: body.modelSelection, ...(body.runtimeMode && { runtimeMode: body.runtimeMode }) };
      const threadId = newId();
      await send(...createThreadCommands(threadId, create, await outgoing(threadId, images)));
      return threadId;
    },
  };
}
