import type { AssetResource, Command, FileUpload, ImageUpload, LaunchThread, NewScheduledTask, ProjectMutation, RawConfig, RawRefs, RawVcsStatus, RawProject, RawProjection, RawScheduledTask, RawSearchMatch, RawTurnItem, RawUsageSummary, SearchEntriesResponse, ScheduledTaskChange, SecretAnswer, ShellItem, T3Port } from "../../src/integrations/t3/schemas.ts";

/** In-memory T3: records commands, uploads and shell subscriptions; each answer can be swapped. */
export class FakePort implements T3Port {
  commands: Command[] = [];
  uploads: Array<{ threadId: string; messageId: string; images: ImageUpload[] }> = [];
  subscriptions: Array<{ onItems(items: ShellItem[]): void; onEnd(error?: Error): void; cancelled: boolean }> = [];
  projection: RawProjection = {};
  assets: AssetResource[] = [];
  ranges: Array<string | undefined> = [];
  assetFileName = "image.png";
  assetType = "image/png";
  searchCalls: Array<{ query: string; limit?: number }> = [];
  searchResult: RawSearchMatch[] = [];
  turnItems: Record<string, RawTurnItem> = {};
  turnItemCalls: Array<{ threadId: string; itemId: string }> = [];
  entriesCalls: Array<{ cwd: string; query: string; limit: number }> = [];
  entries: SearchEntriesResponse = { entries: [], truncated: false };
  mutations: Array<{ mutation: ProjectMutation; commandId: string }> = [];
  mutateResult: RawProject = { id: "created-project", title: "Created" };
  mutateError: Error | null = null;
  browseCalls: string[] = [];
  browseResult: { parentPath: string; entries: Array<{ name: string; fullPath: string }> } = { parentPath: "/", entries: [] };
  browseError: Error | null = null;
  kinds: Array<string | null> = ["directory"];
  fileUploads: FileUpload[] = [];
  deletedAttachments: string[] = [];
  scheduledTasks: RawScheduledTask[] = [];
  scheduledTasksError: Error | null = null;
  deletedTasks: string[] = [];
  deleteError: Error | null = null;
  createdTasks: NewScheduledTask[] = [];
  createError: Error | null = null;
  createdWebhookUrl: string | null = null;
  updatedTasks: ({ id: string } & ScheduledTaskChange)[] = [];
  updateError: Error | null = null;
  workspaceCalls: { id: string; workspaceStrategy: { type: "root" } }[] = [];
  workspaceError: Error | null = null;
  enabledCalls: { id: string; enabled: boolean }[] = [];
  enabledError: Error | null = null;
  runNowCalls: string[] = [];
  runNowError: Error | null = null;
  taskSubscriptions: Array<{ onTasks(tasks: RawScheduledTask[]): void; onEnd(error?: Error): void; cancelled: boolean }> = [];
  secretAnswers: Array<{ threadId: string; turnItemId: string; answer: SecretAnswer }> = [];
  secretError: Error | null = null;
  dispatchError: Error | null = null;
  projectionError: Error | null = null;
  projectionCalls = 0;
  /** Per-thread answers; a thread not listed gets `projection`. */
  projections: Record<string, RawProjection> = {};
  projectionFailures = new Set<string>();
  /** Holds every projection read until it settles: tests use it to count reads in flight. */
  projectionGate: (() => Promise<void>) | null = null;
  projectionsInFlight = 0;
  peakProjectionsInFlight = 0;
  usage: RawUsageSummary = { buckets: [] };
  usageError: Error | null = null;
  usageCalls: Array<{ sinceDay: string; untilDay: string; timeZone: string }> = [];
  /** Holds each usage read until it settles. */
  usageGate: (() => Promise<void>) | null = null;
  refreshCalls = 0;
  refreshProviders: () => Promise<void> = async () => {
    this.refreshCalls++;
  };
  launches: Array<{ launch: LaunchThread; commandId: string }> = [];
  launchError: Error | null = null;
  refCalls: Array<{ cwd: string; query?: string; cursor?: number; limit: number }> = [];
  refs: RawRefs = { refs: [], isRepo: true, hasPrimaryRemote: false, nextCursor: null, totalCount: 0 };
  refsError: Error | null = null;
  statusCalls: string[] = [];
  status: RawVcsStatus = { isRepo: true, hasPrimaryRemote: false, refName: "main", hasWorkingTreeChanges: false };
  statusError: Error | null = null;
  switches: Array<{ cwd: string; refName: string }> = [];
  /** What switchRef answers; null echoes the asked name. */
  /** Undefined: echo the asked name. */
  switchResult: string | null | undefined = undefined;
  switchError: Error | null = null;
  creates: Array<{ cwd: string; refName: string }> = [];
  createRefError: Error | null = null;
  /** Every call that changes T3, in order: lets a test check the sequence. */
  log: string[] = [];
  config: () => Promise<RawConfig> = async () => ({ providers: [], environment: { serverVersion: "1.0.0", orchestrationProtocolVersion: 2 } });

  async threadProjection(threadId?: string): Promise<RawProjection> {
    this.projectionCalls++;
    this.projectionsInFlight++;
    this.peakProjectionsInFlight = Math.max(this.peakProjectionsInFlight, this.projectionsInFlight);
    try {
      await this.projectionGate?.();
      if (this.projectionError || (threadId !== undefined && this.projectionFailures.has(threadId))) throw this.projectionError ?? new Error("T3 is unreachable");
      return (threadId !== undefined && this.projections[threadId]) || this.projection;
    } finally {
      this.projectionsInFlight--;
    }
  }

  async usageSummary(range: { sinceDay: string; untilDay: string; timeZone: string }): Promise<RawUsageSummary> {
    this.usageCalls.push(range);
    await this.usageGate?.();
    if (this.usageError) throw this.usageError;
    return this.usage;
  }

  async launchThread(launch: LaunchThread, commandId: string) {
    this.log.push("launch");
    if (this.launchError) throw this.launchError;
    this.launches.push({ launch, commandId });
    return { threadId: launch.threadId };
  }

  async listRefs(cwd: string, options: { query?: string; cursor?: number; limit: number }) {
    this.refCalls.push({ cwd, ...options });
    if (this.refsError) throw this.refsError;
    return this.refs;
  }

  async vcsStatus(cwd: string) {
    this.statusCalls.push(cwd);
    if (this.statusError) throw this.statusError;
    return this.status;
  }

  async switchRef(cwd: string, refName: string) {
    this.log.push("switch");
    if (this.switchError) throw this.switchError;
    this.switches.push({ cwd, refName });
    return this.switchResult === undefined ? refName : this.switchResult;
  }

  async createRef(cwd: string, refName: string) {
    this.log.push("create");
    if (this.createRefError) throw this.createRefError;
    this.creates.push({ cwd, refName });
    return refName;
  }

  async dispatch(command: Command) {
    if (this.dispatchError) throw this.dispatchError;
    this.commands.push(command);
    return { sequence: 1 };
  }

  async answerSecretRequest(threadId: string, turnItemId: string, answer: SecretAnswer) {
    if (this.secretError) throw this.secretError;
    this.secretAnswers.push({ threadId, turnItemId, answer });
  }

  async listScheduledTasks() {
    if (this.scheduledTasksError) throw this.scheduledTasksError;
    return this.scheduledTasks;
  }

  async deleteScheduledTask(id: string) {
    if (this.deleteError) throw this.deleteError;
    this.deletedTasks.push(id);
  }

  async createScheduledTask(task: NewScheduledTask): Promise<RawScheduledTask> {
    if (this.createError) throw this.createError;
    this.createdTasks.push(task);
    const webhook = task.schedule.type === "webhook" ? { url: this.createdWebhookUrl, hasSecret: task.schedule.signature !== null } : null;
    return { id: task.id, title: task.title, nextRunAt: "2026-11-05T09:00:00.000Z", ...(webhook && { webhook }) };
  }

  async updateScheduledTask(id: string, change: ScheduledTaskChange) {
    if (this.updateError) throw this.updateError;
    this.updatedTasks.push({ id, ...change });
  }

  async setScheduledTaskWorkspace(id: string, workspaceStrategy: { type: "root" }) {
    if (this.workspaceError) throw this.workspaceError;
    this.workspaceCalls.push({ id, workspaceStrategy });
  }

  async setScheduledTaskEnabled(id: string, enabled: boolean) {
    if (this.enabledError) throw this.enabledError;
    this.enabledCalls.push({ id, enabled });
  }

  async runScheduledTaskNow(id: string) {
    if (this.runNowError) throw this.runNowError;
    this.runNowCalls.push(id);
  }

  subscribeScheduledTasks(onTasks: (tasks: RawScheduledTask[]) => void, onEnd: (error?: Error) => void) {
    const subscription = { onTasks, onEnd, cancelled: false };
    this.taskSubscriptions.push(subscription);
    return {
      cancel() {
        subscription.cancelled = true;
      },
    };
  }

  async searchThreads(query: string, limit?: number) {
    this.searchCalls.push({ query, ...(limit !== undefined && { limit }) });
    return this.searchResult;
  }

  async turnItem(threadId: string, itemId: string) {
    this.turnItemCalls.push({ threadId, itemId });
    return this.turnItems[itemId] ?? null;
  }

  async searchEntries(cwd: string, query: string, limit: number) {
    this.entriesCalls.push({ cwd, query, limit });
    return this.entries;
  }

  async uploadAttachment(upload: FileUpload) {
    this.fileUploads.push(upload);
    return `file-${this.fileUploads.length}`;
  }

  async deleteAttachment(attachmentId: string) {
    this.deletedAttachments.push(attachmentId);
  }

  getConfig() {
    return this.config();
  }

  async persistAttachments(threadId: string, messageId: string, images: ImageUpload[]) {
    this.log.push("persist");
    this.uploads.push({ threadId, messageId, images });
    return images.map((image, index) => ({ type: "image", id: `stored-${index}`, name: image.name, mimeType: image.mimeType, sizeBytes: image.sizeBytes }));
  }

  async mutateProject(mutation: ProjectMutation, commandId: string) {
    this.mutations.push({ mutation, commandId });
    if (this.mutateError) throw this.mutateError;
    return this.mutateResult;
  }

  async browseFolders(partialPath: string) {
    this.browseCalls.push(partialPath);
    if (this.browseError) throw this.browseError;
    return this.browseResult;
  }

  async pathKinds(_paths: string[]) {
    return this.kinds;
  }

  async ensureScratchProject() {
    return "scratch-project";
  }

  async fetchAsset(resource: AssetResource, range?: string) {
    this.ranges.push(range);
    this.assets.push(resource);
    return { response: new Response("bytes", { headers: { "content-type": this.assetType } }), fileName: this.assetFileName };
  }

  subscribeShell(onItems: (items: ShellItem[]) => void, onEnd: (error?: Error) => void) {
    const subscription = { onItems, onEnd, cancelled: false };
    this.subscriptions.push(subscription);
    return {
      cancel() {
        subscription.cancelled = true;
      },
    };
  }
}
