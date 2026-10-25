import type { AssignIssueBody, CreateThreadBody, LinearIssue, ModelSelection, RespondBody, SendMessageBody, ThreadDetail, ThreadSettingsBody } from "../../shared/api.ts";
import { ACTIVE_STATUSES, RUNNING_RUN_STATUSES } from "../../shared/status.ts";
import { IntegrationError } from "../integrations/errors.ts";
import {
  approvalCommand,
  createThreadCommands,
  dismissCommand,
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
import { toProviders } from "./providers.ts";
import type { ShellStore } from "./shellStore.ts";
import { toThreadDetail } from "./threadDetail.ts";

export type { ImageUpload };

const CLAUDE_INSTANCE = "claudeAgent";
const CLAUDE_FALLBACK_MODEL = "claude-opus-5-5";
const CODEX_INSTANCE = "codex";

export interface ActionsOptions {
  port: T3Port;
  store: Pick<ShellStore, "thread" | "project" | "backgroundTasks">;
  board: Pick<LinearBoard, "get">;
  newId?: () => string;
}

/** What the user can do to T3 threads from the dashboard. */
export interface Actions {
  threadDetail(threadId: string): Promise<ThreadDetail>;
  createThread(create: CreateThreadBody, images: ImageUpload[]): Promise<string>;
  sendMessage(threadId: string, body: Omit<SendMessageBody, "attachments">, images: ImageUpload[]): Promise<void>;
  changeSettings(threadId: string, settings: ThreadSettingsBody): Promise<void>;
  interrupt(threadId: string): Promise<void>;
  respond(threadId: string, requestId: string, answer: RespondBody): Promise<void>;
  dismiss(threadId: string, requestId: string): Promise<void>;
  assign(body: AssignIssueBody): Promise<string>;
  /** An image or page of the thread, fetched from T3. */
  asset(threadId: string, request: AssetRequest): Promise<{ response: Response; html: boolean }>;
}

export type AssetRequest = { attachmentId: string } | { path: string };

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)$/i;

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

  async function modelFor(agent: AssignIssueBody["agent"], defaultSelection: ModelSelection | null): Promise<ModelSelection> {
    if (agent === "claude") {
      return defaultSelection?.instanceId === CLAUDE_INSTANCE ? defaultSelection : { instanceId: CLAUDE_INSTANCE, model: CLAUDE_FALLBACK_MODEL };
    }
    const provider = toProviders(await t3(port.getConfig())).find((entry) => entry.instanceId === CODEX_INSTANCE);
    const first = provider?.models[0];
    if (!first) throw new DomainError("conflict", "No Codex model available");
    return { instanceId: CODEX_INSTANCE, model: first.slug };
  }

  return {
    async threadDetail(threadId) {
      return toThreadDetail(threadId, await t3(port.threadProjection(threadId)), store.thread(threadId), store.backgroundTasks(threadId));
    },

    // T3 signs any readable file: only serve images the thread itself shows.
    async asset(threadId, request) {
      let resource: AssetResource;
      if ("attachmentId" in request) {
        if (!request.attachmentId.startsWith(`${threadId}-`)) throw new DomainError("not-found", "No such attachment in this thread");
        resource = { _tag: "attachment", attachmentId: request.attachmentId };
      } else {
        const { path } = request;
        if (!path.startsWith("/") || !IMAGE_FILE.test(path) || path.includes("/../")) throw new DomainError("invalid", "Only images can be shown");
        const projection = await t3(port.threadProjection(threadId));
        if (!(projection.messages ?? []).some((message) => message.text?.includes(`(${path})`))) throw new DomainError("not-found", "This thread does not show that image");
        resource = { _tag: "media-file", threadId, path };
      }
      const { response, fileName } = await t3(port.fetchAsset(resource));
      return { response, html: resource._tag === "attachment" && fileName.endsWith(".html") };
    },

    async createThread(create, images) {
      const threadId = newId();
      await send(...createThreadCommands(threadId, create, await outgoing(threadId, images)));
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

    async assign(body) {
      const issue = await findIssue(body.issueId);
      const project = store.project(body.projectId);
      if (!project) throw new DomainError("conflict", "T3 project not found");
      const modelSelection = await modelFor(body.agent, project.defaultModelSelection);
      const create = { projectId: project.id, title: `${issue.identifier} ${issue.title}`, text: `Traite le ticket Linear ${issue.identifier} : ${issue.url}`, modelSelection };
      const threadId = newId();
      await send(...createThreadCommands(threadId, create, await outgoing(threadId, [])));
      return threadId;
    },
  };
}
