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
    return demoScheduledTasks(this.now()).filter((task) => !this.deletedTasks.has(task.id));
  }

  async deleteScheduledTask(id: string): Promise<void> {
    this.deletedTasks.add(id);
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
        projection.messages = [...(projection.messages ?? []), message];
        projection.visibleTurnItems = [...(projection.visibleTurnItems ?? []), { id: `${message.id}-item`, messageId: message.id }];
        Object.assign(thread, { latestUserMessageAt: at, latestVisibleMessage: { role: "user", text: message.text, updatedAt: at }, settledOverride: null });
        break;
      }
      case "runtime-request.respond":
      case "thread.user-input.dismiss":
        projection.runtimeRequests = (projection.runtimeRequests ?? []).map((request) => (request.id === command.requestId ? { ...request, status: "resolved" } : request));
        thread.pendingRuntimeRequest = null;
        break;
      case "run.interrupt":
        Object.assign(thread, { status: "interrupted", activeRunId: null, activityRunStartedAt: null, latestRunCompletedAt: at });
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

  private publish(thread: RawThread): void {
    for (const listener of this.listeners) listener([{ kind: "thread.updated", thread }]);
  }
}

/** A Linear API that answers every query with the demo issues. */
export const demoLinearFetch =
  (now: Date): FetchLike =>
  async () =>
    Response.json({ data: { viewer: { id: "demo-viewer", assignedIssues: { nodes: demoIssues(now), pageInfo: { hasNextPage: false, endCursor: null } } } } });
