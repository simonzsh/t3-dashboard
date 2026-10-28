import { RUNNING_RUN_STATUSES } from "../../../shared/status.ts";
import type { FetchLike } from "../../integrations/linear/client.ts";
import type { AttachmentRef, Command, ImageUpload, RawConfig, RawProjection, RawScheduledTask, RawSearchMatch, RawThread, ShellItem, T3Port } from "../../integrations/t3/schemas.ts";
import { searchProjections } from "./search.ts";
import { demoFixtures, demoIssues, demoScheduledTasks, SCRATCH_PROJECT_ID } from "./fixtures.ts";

type Listener = (items: ShellItem[]) => void;

/** An in-memory T3 for the demo: it serves the fixtures and applies commands locally. */
export class DemoPort implements T3Port {
  private readonly now: () => Date;
  private readonly projects;
  private readonly config: RawConfig;
  private readonly projections = new Map<string, RawProjection>();
  private readonly listeners = new Set<Listener>();
  private readonly deletedTasks = new Set<string>();
  private readonly renamedTasks = new Map<string, string>();
  private sequence = 0;

  constructor(now: () => Date) {
    this.now = now;
    const fixtures = demoFixtures(now());
    this.projects = fixtures.projects;
    this.config = fixtures.config;
    for (const [id, projection] of Object.entries(fixtures.projections)) this.projections.set(id, projection);
  }

  async threadProjection(threadId: string): Promise<RawProjection> {
    const projection = this.projections.get(threadId);
    if (!projection) throw new Error("Unknown demo thread");
    return projection;
  }

  async searchThreads(query: string, limit?: number): Promise<RawSearchMatch[]> {
    return searchProjections(this.projections.values(), query, limit);
  }

  async getConfig(): Promise<RawConfig> {
    return this.config;
  }

  async listScheduledTasks(): Promise<RawScheduledTask[]> {
    return demoScheduledTasks(this.now())
      .filter((task) => !this.deletedTasks.has(task.id))
      .map((task) => ({ ...task, title: this.renamedTasks.get(task.id) ?? task.title }));
  }

  async deleteScheduledTask(id: string): Promise<void> {
    this.deletedTasks.add(id);
  }

  async renameScheduledTask(id: string, title: string): Promise<void> {
    this.renamedTasks.set(id, title);
  }

  async dispatch(command: Command): Promise<unknown> {
    const at = this.now().toISOString();
    const threadId = String(command.threadId);
    if (command.type === "thread.create") {
      const thread: RawThread = {
        id: threadId,
        projectId: String(command.projectId),
        title: String(command.title),
        modelSelection: command.modelSelection as RawThread["modelSelection"],
        providerInstanceId: (command.modelSelection as { instanceId?: string } | undefined)?.instanceId ?? null,
        runtimeMode: String(command.runtimeMode),
        status: "idle",
        createdAt: at,
        updatedAt: at,
      };
      this.projections.set(threadId, { thread, messages: [], visibleTurnItems: [], runs: [] });
      this.publish(thread);
      return { sequence: ++this.sequence };
    }
    const projection = await this.threadProjection(threadId);
    const thread = { ...projection.thread!, updatedAt: at };
    switch (command.type) {
      case "message.dispatch": {
        const message = { id: String(command.messageId), role: "user" as const, text: String(command.text), createdAt: at };
        const runs = projection.runs ?? [];
        const queued = (command.dispatchMode as { type?: string } | undefined)?.type === "queue_after_active" && (thread.activeRunId || runs.some((run) => RUNNING_RUN_STATUSES.has(run.status ?? "")));
        // The demo never completes a run, so a queued message never starts by itself.
        if (queued) projection.runs = [...runs, { id: `${message.id}-run`, status: "queued", userMessageId: message.id, ordinal: runs.length + 1, createdAt: at }];
        projection.messages = [...(projection.messages ?? []), message];
        projection.visibleTurnItems = [
          ...(projection.visibleTurnItems ?? []),
          { id: `${message.id}-item`, type: "user_message", messageId: message.id, ...(queued && { runId: `${message.id}-run`, inputIntent: "queued_turn" }) },
        ];
        Object.assign(thread, { latestUserMessageAt: at, latestVisibleMessage: { role: "user", text: message.text, updatedAt: at }, settledOverride: null });
        break;
      }
      case "runtime-request.respond":
      case "thread.user-input.dismiss":
        projection.runtimeRequests = (projection.runtimeRequests ?? []).map((request) => (request.id === command.requestId ? { ...request, status: "resolved" } : request));
        thread.pendingRuntimeRequest = null;
        break;
      case "queued-message.promote-to-steer": {
        const run = this.queuedRun(projection, command);
        projection.runs = (projection.runs ?? []).filter((candidate) => candidate !== run);
        projection.visibleTurnItems = (projection.visibleTurnItems ?? []).map((entry) =>
          "messageId" in entry && entry.messageId === run.userMessageId ? { ...entry, runId: String(command.targetRunId), inputIntent: "promoted_queued_to_steer" } : entry,
        );
        break;
      }
      case "queued-run.cancel": {
        const run = this.queuedRun(projection, command);
        this.updateRun(projection, run.id, { status: "cancelled", completedAt: at });
        break;
      }
      case "queued-run.edit": {
        const run = this.queuedRun(projection, command);
        projection.messages = (projection.messages ?? []).map((message) => (message.id === run.userMessageId ? { ...message, text: String(command.text) } : message));
        break;
      }
      case "queued-run.start": {
        const run = this.queuedRun(projection, command);
        this.updateRun(projection, run.id, { status: "running", startedAt: at, queueHeld: false });
        Object.assign(thread, { status: "running", activeRunId: run.id, activityRunStartedAt: at });
        break;
      }
      case "run.interrupt":
        Object.assign(thread, { status: "interrupted", activeRunId: null, activityRunStartedAt: null, latestRunCompletedAt: at, pendingRuntimeRequest: null });
        // holdQueue: queued messages wait for "Send now".
        projection.runs = (projection.runs ?? []).map((run) =>
          run.id === command.runId ? { ...run, status: "interrupted", completedAt: at } : run.status === "queued" ? { ...run, queueHeld: true } : run,
        );
        // Stopping the turn drops its pending questions, as in T3.
        projection.runtimeRequests = (projection.runtimeRequests ?? []).map((request) => (request.status === "pending" ? { ...request, status: "cancelled" } : request));
        break;
      case "thread.stop":
        Object.assign(thread, { pendingBackgroundTasks: [] });
        break;
      case "subagent.stop":
        projection.subagents = (projection.subagents ?? []).map((raw) =>
          raw.id === command.subagentId ? { ...raw, status: "interrupted", progress: null, completedAt: at } : raw,
        );
        break;
      case "thread.settle":
        Object.assign(thread, { settledOverride: "settled", settledAt: at });
        break;
      case "thread.unsettle":
        Object.assign(thread, { settledOverride: "active", settledAt: null, unsettledAt: at });
        break;
      case "thread.model-selection.set":
        thread.modelSelection = command.modelSelection as RawThread["modelSelection"];
        break;
      case "thread.metadata.update":
        thread.title = String(command.title);
        break;
      case "thread.runtime-mode.set":
        thread.runtimeMode = String(command.runtimeMode);
        break;
    }
    projection.thread = thread;
    this.publish(thread);
    return { sequence: ++this.sequence };
  }

  async persistAttachments(threadId: string, messageId: string, images: ImageUpload[]): Promise<AttachmentRef[]> {
    return images.map((image, index) => ({ type: "image", id: `${threadId}-${messageId}-${index}`, name: image.name, mimeType: image.mimeType, sizeBytes: image.sizeBytes }));
  }

  async ensureScratchProject(): Promise<string> {
    return SCRATCH_PROJECT_ID;
  }

  // The demo stores no files: every image or page is missing.
  async fetchAsset(): Promise<{ response: Response; fileName: string }> {
    return { response: new Response("Not available in the demo", { status: 404 }), fileName: "missing.txt" };
  }

  // Answers like T3 on connect: one snapshot, then "synchronized", then live updates.
  subscribeShell(onItems: Listener): { cancel(): void } {
    this.listeners.add(onItems);
    const threads = [...this.projections.values()].map((projection) => projection.thread!);
    queueMicrotask(() => onItems([{ kind: "snapshot", snapshot: { projects: this.projects, threads } }, { kind: "synchronized" }]));
    return { cancel: () => void this.listeners.delete(onItems) };
  }

  private queuedRun(projection: RawProjection, command: Command): NonNullable<RawProjection["runs"]>[number] {
    const run = projection.runs?.find((candidate) => candidate.id === (command.runId ?? command.queuedRunId));
    if (run?.status !== "queued") throw new Error("This message is no longer queued");
    return run;
  }

  private updateRun(projection: RawProjection, runId: string, patch: Partial<NonNullable<RawProjection["runs"]>[number]>): void {
    projection.runs = (projection.runs ?? []).map((run) => (run.id === runId ? { ...run, ...patch } : run));
  }

  private publish(thread: RawThread): void {
    for (const listener of this.listeners) listener([{ kind: "thread.updated", thread }]);
  }
}

/** A Linear API that answers every query with the demo issues. */
export const demoLinearFetch =
  (now: Date): FetchLike =>
  async () =>
    Response.json({ data: { viewer: { id: "demo-viewer", assignedIssues: { nodes: demoIssues(now), pageInfo: { hasNextPage: false, endCursor: null } } } } });
