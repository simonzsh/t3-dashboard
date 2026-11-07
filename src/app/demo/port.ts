import { RUNNING_RUN_STATUSES } from "../../../shared/status.ts";
import type { FetchLike } from "../../integrations/linear/client.ts";
import type { AttachmentRef, Command, FileUpload, ImageUpload, NewScheduledTask, RawConfig, RawProjection, RawScheduledTask, RawSearchMatch, RawThread, RawTurnItem, RawUsageSummary, SearchEntriesResponse, ScheduledTaskChange, ShellItem, T3Port } from "../../integrations/t3/schemas.ts";
import { searchEntries, searchProjections } from "./search.ts";
import { DEMO_CONTEXT_TOKENS, demoFixtures, demoIssues, demoScheduledTasks, demoUsageBuckets, demoUsageLimits, SCRATCH_PROJECT_ID } from "./fixtures.ts";

const COMPACTED_TOKENS = 12_000;

type Listener = (items: ShellItem[]) => void;

// What T3 stores: a webhook schedule never holds the secret.
function storedSchedule(schedule: ScheduledTaskChange["schedule"]): RawScheduledTask["schedule"] {
  if (schedule.type !== "webhook") return schedule;
  const { signature, filters } = schedule;
  return { type: "webhook", signature: signature && { header: signature.header, encoding: signature.encoding, prefix: signature.prefix }, filters };
}

/** An in-memory T3 for the demo: it serves the fixtures and applies commands locally. */
export class DemoPort implements T3Port {
  private readonly now: () => Date;
  private readonly projects;
  private readonly config: RawConfig;
  private readonly projections = new Map<string, RawProjection>();
  private readonly listeners = new Set<Listener>();
  private readonly hidden: Set<string>;
  private readonly deletedTasks = new Set<string>();
  private readonly createdTasks: RawScheduledTask[] = [];
  private readonly pausedTasks = new Set<string>();
  private readonly updatedTasks = new Map<string, Partial<RawScheduledTask>>();
  // Built once, like the threads: a lastRunAt that moves on each read would log a new run every poll.
  private readonly tasks: RawScheduledTask[];
  private sequence = 0;
  private uploads = 0;

  constructor(now: () => Date) {
    this.now = now;
    const fixtures = demoFixtures(now());
    this.tasks = demoScheduledTasks(now());
    this.projects = fixtures.projects;
    this.config = fixtures.config;
    this.hidden = new Set(fixtures.hiddenThreadIds);
    for (const [id, projection] of Object.entries(fixtures.projections)) this.projections.set(id, projection);
  }

  async threadProjection(threadId: string): Promise<RawProjection> {
    const projection = this.projections.get(threadId);
    if (!projection) throw new Error("Unknown demo thread");
    return projection;
  }

  async usageSummary({ sinceDay, untilDay }: { sinceDay: string; untilDay: string; timeZone: string }): Promise<RawUsageSummary> {
    return demoUsageBuckets(sinceDay, untilDay);
  }

  async searchThreads(query: string, limit?: number): Promise<RawSearchMatch[]> {
    return searchProjections(this.projections.values(), query, limit);
  }

  async turnItem(threadId: string, itemId: string): Promise<RawTurnItem | null> {
    const { turnItems = [] } = await this.threadProjection(threadId);
    return turnItems.map((entry) => ("item" in entry && entry.item ? entry.item : (entry as RawTurnItem))).find((item) => item.id === itemId) ?? null;
  }

  async searchEntries(_cwd: string, query: string, limit: number): Promise<SearchEntriesResponse> {
    return searchEntries(query, limit);
  }

  async uploadAttachment(_upload: FileUpload): Promise<string> {
    return `demo-upload-${++this.uploads}`;
  }

  async deleteAttachment(): Promise<void> {}

  // The demo keeps no secret: the card stays as it is.
  async answerSecretRequest(): Promise<void> {}

  async getConfig(): Promise<RawConfig> {
    const limits = demoUsageLimits(this.now());
    return { ...this.config, providers: this.config.providers?.map((provider) => ({ ...provider, usageLimits: limits[provider.instanceId] })) };
  }

  async listScheduledTasks(): Promise<RawScheduledTask[]> {
    return [...this.tasks, ...this.createdTasks]
      .filter((task) => !this.deletedTasks.has(task.id))
      .map((task) => ({ ...task, ...this.updatedTasks.get(task.id), ...(this.pausedTasks.has(task.id) && { enabled: false }) }));
  }

  // The demo keeps its tasks in the default workspace: nothing to move.
  async setScheduledTaskWorkspace(): Promise<void> {}

  async setScheduledTaskEnabled(id: string, enabled: boolean): Promise<void> {
    if (enabled) this.pausedTasks.delete(id);
    else this.pausedTasks.add(id);
  }

  // Like T3: an unbound task opens a fresh thread, which the demo leaves running.
  async runScheduledTaskNow(id: string): Promise<void> {
    const task = (await this.listScheduledTasks()).find((entry) => entry.id === id);
    if (!task) throw new Error("Unknown demo task");
    const at = this.now().toISOString();
    this.updatedTasks.set(id, { ...this.updatedTasks.get(id), lastRunAt: at, lastRunStatus: "running", lastRunError: undefined });
    if (task.threadId) return;
    const threadId = `demo-run-${id}-${++this.sequence}`;
    const thread: RawThread = {
      id: threadId,
      projectId: task.projectId ?? SCRATCH_PROJECT_ID,
      title: task.title,
      modelSelection: task.modelSelection,
      providerInstanceId: task.modelSelection?.instanceId,
      runtimeMode: task.runtimeMode,
      creationSource: task.creationSource,
      status: "running",
      activeRunId: `run-${threadId}`,
      createdAt: at,
      updatedAt: at,
    };
    this.projections.set(threadId, { thread, messages: [{ id: `${threadId}-m0`, role: "user", text: task.prompt ?? "", createdAt: at, scheduledTaskId: id }], visibleTurnItems: [], runs: [] });
    this.publish(thread);
  }

  subscribeScheduledTasks(onTasks: (tasks: RawScheduledTask[]) => void): { cancel(): void } {
    let cancelled = false;
    void this.listScheduledTasks().then((tasks) => {
      if (!cancelled) onTasks(tasks);
    });
    return { cancel: () => void (cancelled = true) };
  }

  // Nothing is scheduled: the task is only listed. The secret is dropped.
  async createScheduledTask(task: NewScheduledTask): Promise<RawScheduledTask> {
    const { schedule } = task;
    const now = this.now().toISOString();
    const created: RawScheduledTask = {
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      enabled: true,
      schedule: storedSchedule(schedule),
      projectId: task.projectId,
      threadId: null,
      modelSelection: task.modelSelection,
      runtimeMode: task.runtimeMode,
      createdBy: "user",
      creationSource: task.creationSource,
      createdAt: now,
      nextRunAt: this.nextRunAt(schedule),
      ...(schedule.type === "webhook" && { webhook: { url: `https://relay.example.invalid/v1/hooks/demo/${encodeURIComponent(task.id)}/token`, hasSecret: schedule.signature !== null } }),
    };
    this.createdTasks.push(created);
    return created;
  }

  async deleteScheduledTask(id: string): Promise<void> {
    this.deletedTasks.add(id);
  }

  // Like T3, the secret is dropped and only its presence stays.
  async updateScheduledTask(id: string, change: ScheduledTaskChange): Promise<void> {
    const task = (await this.listScheduledTasks()).find((entry) => entry.id === id);
    const { schedule } = change;
    const hasSecret = schedule.type === "webhook" && schedule.signature !== null && (!!schedule.signature.secret || task?.webhook?.hasSecret === true);
    this.updatedTasks.set(id, {
      title: change.title,
      prompt: change.prompt,
      enabled: change.enabled,
      projectId: change.projectId,
      modelSelection: change.modelSelection,
      runtimeMode: change.runtimeMode,
      schedule: storedSchedule(schedule),
      nextRunAt: this.nextRunAt(schedule),
      ...(schedule.type === "webhook" && { webhook: { url: task?.webhook?.url ?? null, hasSecret } }),
    });
    if (change.enabled) this.pausedTasks.delete(id);
  }

  // The demo schedules nothing: a plausible next run is enough.
  private nextRunAt(schedule: ScheduledTaskChange["schedule"]): string | null {
    if (schedule.type === "interval") return new Date(this.now().getTime() + schedule.everyMs).toISOString();
    return schedule.type === "fixed_time" ? new Date(this.now().getTime() + 86_400_000).toISOString() : null;
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
        // Like T3: /compact is not a chat message, it shrinks the context.
        if (command.text === "/compact") {
          projection.providerTurns = [{ tokenUsage: { usedTokens: COMPACTED_TOKENS, maxTokens: DEMO_CONTEXT_TOKENS, updatedAt: at } }];
          break;
        }
        const attachments = (command.attachments as Array<{ type: string; id: string; name: string; mimeType: string; sizeBytes: number }> | undefined) ?? [];
        const message = { id: String(command.messageId), role: "user" as const, text: String(command.text), createdAt: at, attachments };
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
      case "checkpoint.rollback": {
        // Keep what came before the first run after the checkpoint: its message and everything after go.
        const kept = (projection.checkpoints ?? []).find((checkpoint) => checkpoint.id === command.checkpointId)?.appRunOrdinal ?? 0;
        const dropped = (projection.runs ?? []).filter((run) => (run.ordinal ?? 0) > kept);
        const cut = (projection.messages ?? []).findIndex((message) => message.id === dropped[0]?.userMessageId);
        const gone = new Set((cut < 0 ? [] : projection.messages!.slice(cut)).map((message) => message.id));
        projection.messages = (projection.messages ?? []).filter((message) => !gone.has(message.id));
        projection.visibleTurnItems = (projection.visibleTurnItems ?? []).filter((entry) => !("messageId" in entry && gone.has(entry.messageId ?? "")));
        projection.runs = (projection.runs ?? []).filter((run) => !dropped.includes(run));
        projection.checkpoints = (projection.checkpoints ?? []).filter((checkpoint) => (checkpoint.appRunOrdinal ?? 0) <= kept);
        break;
      }
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
    const threads = [...this.projections.values()].map((projection) => projection.thread!).filter((thread) => !this.hidden.has(thread.id));
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
