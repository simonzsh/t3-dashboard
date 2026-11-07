import { describe, issues, parse, type Schema } from "../contract.ts";
import { IntegrationError } from "../errors.ts";
import { RpcConnection } from "./rpc.ts";
import { AssetUrl, FolderBrowseResponse, PathMetadataResponse, RawProject, PersistedAttachments, ScratchProject, ProjectionResponse, RawConfig, SearchEntriesResponse, SearchThreadsResponse, UsageSummaryResponse, DeletedScheduledTask, ScheduledTasksResponse, UpsertedScheduledTask, ShellItem, TurnItemResponse, UploadUrl, WebSocketTicket } from "./schemas.ts";
import type { AssetResource, AttachmentRef, Command, FileUpload, ImageUpload, ProjectMutation, RawProjection, RawScheduledTask, RawSearchMatch, RawUsageSummary, NewScheduledTask, RawTurnItem, ScheduledTaskChange, SecretAnswer, T3Port } from "./schemas.ts";

export const ORCHESTRATION_PROTOCOL = "2";
// Images go up as data URLs of up to 10 MB each: give T3 time to write them.
const UPLOAD_TIMEOUT_MS = 60_000;
// Files go up as raw bytes, up to 50 MB.
const FILE_UPLOAD_TIMEOUT_MS = 120_000;
// A first usage scan reads every session file on the machine.
const USAGE_TIMEOUT_MS = 60_000;
// T3 probes each provider in turn: about 4 s with three providers.
const REFRESH_TIMEOUT_MS = 60_000;

/** The RPC tags the dashboard calls: the contract check looks for each one in the T3 client bundle. */
export const RPC = {
  getConfig: "server.getConfig",
  refreshProviders: "server.refreshProviders",
  persistAttachments: "assets.persistChatAttachments",
  createAssetUrl: "assets.createUrl",
  ensureScratch: "projects.ensureScratch",
  dispatch: "orchestration.dispatchCommand",
  subscribeShell: "orchestration.subscribeShell",
  searchThreads: "orchestration.searchThreads",
  getTurnItem: "orchestration.getTurnItem",
  searchEntries: "projects.searchEntries",
  createUploadUrl: "attachments.createUploadUrl",
  deleteAttachment: "attachments.delete",
  subscribeScheduledTasks: "scheduledTasks.subscribe",
  deleteScheduledTask: "scheduledTasks.delete",
  upsertScheduledTask: "scheduledTasks.upsert",
  setEnabledScheduledTask: "scheduledTasks.setEnabled",
  runNowScheduledTask: "scheduledTasks.runNow",
  answerSecret: "secrets.answerRequest",
  getUsageSummary: "server.getUsageSummary",
  mutateProject: "projects.mutate",
  browseFolders: "filesystem.browse",
  pathMetadata: "filesystem.getMetadata",
} as const;

export type Validation = "ok" | "rejected" | "unreachable";

/** Checks a token with T3: 2xx is ok, 401 or 403 is rejected, anything else is unreachable. */
export function validateWith(origin: () => string, fetchImpl: typeof fetch = fetch) {
  return async (token: string): Promise<Validation> => {
    try {
      const response = await fetchImpl(`${origin().replace(/\/+$/, "")}/api/auth/websocket-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return "ok";
      return response.status === 401 || response.status === 403 ? "rejected" : "unreachable";
    } catch {
      return "unreachable";
    }
  };
}

export interface T3ClientOptions {
  origin: () => Promise<string>;
  /** Read on every request: the token can change while the dashboard runs. */
  token: () => string | null;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  /** Reports a shell item that does not match its schema. */
  warn?: (message: string) => void;
}

// Safe to send twice: a retry after a lost connection cannot repeat a side effect.
const IDEMPOTENT = new Set<string>([RPC.getConfig, RPC.refreshProviders, RPC.searchThreads, RPC.createAssetUrl, RPC.ensureScratch, RPC.getTurnItem, RPC.searchEntries, RPC.setEnabledScheduledTask, RPC.getUsageSummary, RPC.browseFolders, RPC.pathMetadata]);

const SECRET_REFUSALS: Record<string, string> = {
  not_found: "This secret request no longer exists.",
  already_answered: "This secret request was already answered.",
  agent_stopped: "The agent that asked has stopped, so this secret can't be used.",
  store_failed: "T3 could not store the secret.",
  record_failed: "T3 saved the secret but could not update the request.",
};

const UPSERT_FIELDS = ["prompt", "enabled", "schedule", "projectId", "threadId", "workspaceStrategy", "modelSelection", "runtimeMode", "interactionMode", "creationSource"];

interface SharedSocket {
  conn: Promise<RpcConnection>;
  token: string | null;
  origin: string;
}

// A webhook keeps the stored extras (delivery age, dedupe) that the dashboard does not edit.
function mergedSchedule(stored: unknown, change: ScheduledTaskChange["schedule"]): unknown {
  if (change.type !== "webhook") return change;
  const extras = (stored as { type?: unknown } | undefined)?.type === "webhook" ? (stored as Record<string, unknown>) : {};
  return { ...extras, ...change };
}

const read = <T>(schema: Schema<T>, value: unknown, what: string): T => parse(schema, value, { system: "t3", what: `T3 ${what}` });

export class T3Client implements T3Port {
  private readonly origin: () => Promise<string>;
  private readonly token: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly Socket: typeof WebSocket;
  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();
  private shared: SharedSocket | null = null;

  constructor({ origin, token, fetch = globalThis.fetch, WebSocket = globalThis.WebSocket, warn = console.warn }: T3ClientOptions) {
    this.origin = origin;
    this.token = token;
    this.fetchImpl = fetch;
    this.Socket = WebSocket;
    this.warn = warn;
  }

  async threadProjection(threadId: string): Promise<RawProjection> {
    const answer = await this.http("GET", `/api/orchestration/threads/${encodeURIComponent(threadId)}`);
    return read(ProjectionResponse, answer, "thread projection").projection ?? {};
  }

  async usageSummary({ sinceDay, untilDay, timeZone }: { sinceDay: string; untilDay: string; timeZone: string }): Promise<RawUsageSummary> {
    const answer = await this.call(RPC.getUsageSummary, { sinceDay, untilDay, timeZone, resolution: "day" }, USAGE_TIMEOUT_MS);
    return read(UsageSummaryResponse, answer, RPC.getUsageSummary);
  }

  async refreshProviders(): Promise<void> {
    await this.call(RPC.refreshProviders, {}, REFRESH_TIMEOUT_MS);
  }

  async getConfig(): Promise<RawConfig> {
    return read(RawConfig, await this.call(RPC.getConfig, {}), "server.getConfig");
  }

  async listScheduledTasks(): Promise<RawScheduledTask[]> {
    return read(ScheduledTasksResponse, await this.scheduledTasksSnapshot(), RPC.subscribeScheduledTasks).tasks;
  }

  // Not in IDEMPOTENT: a retry after the delete went through would fail on an unknown id.
  async deleteScheduledTask(id: string): Promise<void> {
    read(DeletedScheduledTask, await this.call(RPC.deleteScheduledTask, { id }), "scheduledTasks.delete");
  }

  async createScheduledTask(task: NewScheduledTask): Promise<RawScheduledTask> {
    return read(UpsertedScheduledTask, await this.upsert(task, "T3 refused the scheduled task."), "scheduledTasks.upsert").task;
  }

  async updateScheduledTask(id: string, change: ScheduledTaskChange): Promise<void> {
    await this.upsertKeeping(id, (task) => ({ ...change, schedule: mergedSchedule(task.schedule, change.schedule) }));
  }

  async setScheduledTaskWorkspace(id: string, workspaceStrategy: { type: "root" }): Promise<void> {
    await this.upsertKeeping(id, { workspaceStrategy });
  }

  async setScheduledTaskEnabled(id: string, enabled: boolean): Promise<void> {
    await this.call(RPC.setEnabledScheduledTask, { id, enabled });
  }

  // Not in IDEMPOTENT: a retry after the run started would start a second one.
  async runScheduledTaskNow(id: string): Promise<void> {
    await this.call(RPC.runNowScheduledTask, { id });
  }

  // The upsert replaces the whole task, so every field comes from T3's raw answer: the reduced schema would drop some.
  private async upsertKeeping(id: string, patch: Record<string, unknown> | ((task: Record<string, unknown>) => Record<string, unknown>)): Promise<void> {
    const answer = await this.scheduledTasksSnapshot();
    read(ScheduledTasksResponse, answer, RPC.subscribeScheduledTasks);
    const task = (answer as { tasks: Record<string, unknown>[] }).tasks.find((entry) => entry.id === id);
    if (!task) throw new IntegrationError("T3 has no scheduled task with this id", { system: "t3", kind: "refused" });
    const keep = Object.fromEntries(["title", ...UPSERT_FIELDS].map((key) => [key, task[key]]));
    await this.upsert({ ...keep, ...(typeof patch === "function" ? patch(task) : patch), id, requireExisting: true }, "T3 refused the scheduled task update.");
  }

  // T3's own message can echo the payload, so a refusal is rebuilt without it: the payload may hold a signing secret.
  private async upsert(payload: unknown, refused: string): Promise<unknown> {
    try {
      return await this.call(RPC.upsertScheduledTask, payload);
    } catch (error) {
      if (!(error instanceof IntegrationError) || error.kind !== "refused") throw error;
      const signing = error.message.includes("needs a signing secret");
      throw new IntegrationError(signing ? "T3 needs a signing secret for this webhook." : refused, { system: "t3", kind: "refused", ...(error.reason && { reason: error.reason }) });
    }
  }

  // T3 sends an initial snapshot, then keeps the stream open for changes.
  private async scheduledTasksSnapshot(): Promise<unknown> {
    const connection = await (await this.sharedSocket()).conn;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.cancel();
        reject(new IntegrationError("T3 did not send a scheduled tasks snapshot within 10000 ms", { system: "t3", kind: "unreachable" }));
      }, 10_000);
      const stream = connection.stream(RPC.subscribeScheduledTasks, {}, (values) => {
        if (values.length === 0) return;
        clearTimeout(timer);
        stream.cancel();
        resolve(values[0]);
      }, (error) => {
        clearTimeout(timer);
        reject(error ?? new IntegrationError("T3 ended the scheduled tasks stream before its snapshot", { system: "t3", kind: "protocol" }));
      });
    });
  }

  async searchThreads(query: string, limit?: number): Promise<RawSearchMatch[]> {
    const payload = limit === undefined ? { query } : { query, limit };
    return read(SearchThreadsResponse, await this.call(RPC.searchThreads, payload), "orchestration.searchThreads").matches;
  }

  async turnItem(threadId: string, itemId: string): Promise<RawTurnItem | null> {
    return read(TurnItemResponse, await this.call(RPC.getTurnItem, { threadId, itemId }), RPC.getTurnItem).item ?? null;
  }

  async searchEntries(cwd: string, query: string, limit: number): Promise<SearchEntriesResponse> {
    return read(SearchEntriesResponse, await this.call(RPC.searchEntries, { cwd, query, limit }), RPC.searchEntries);
  }

  // T3 mints a short-lived URL; the bytes go there without the bearer token.
  async uploadAttachment({ type, name, mimeType, sizeBytes, bytes }: FileUpload): Promise<string> {
    const { attachmentId, relativeUrl } = read(UploadUrl, await this.call(RPC.createUploadUrl, { type, name, mimeType, sizeBytes }), RPC.createUploadUrl);
    let response: Response;
    try {
      response = await this.fetchImpl(`${await this.baseUrl()}${relativeUrl}`, { method: "POST", headers: { "content-type": mimeType }, body: new Blob([bytes]), signal: AbortSignal.timeout(FILE_UPLOAD_TIMEOUT_MS) });
    } catch (error) {
      throw new IntegrationError((error as Error).message, { system: "t3", kind: "unreachable" });
    }
    if (!response.ok) throw new IntegrationError(`T3 answered ${response.status} for an upload`, { system: "t3", kind: "refused", status: response.status });
    return attachmentId;
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.call(RPC.deleteAttachment, { attachmentId });
  }

  // The refusal is rebuilt from T3's reason: the cause of the failure could hold the value.
  async answerSecretRequest(threadId: string, turnItemId: string, answer: SecretAnswer): Promise<void> {
    try {
      await this.call(RPC.answerSecret, { threadId, turnItemId, answer });
    } catch (error) {
      if (!(error instanceof IntegrationError) || error.kind !== "refused") throw error;
      const reason = error.reason ?? "unknown";
      throw new IntegrationError(SECRET_REFUSALS[reason] ?? "T3 could not take the secret", { system: "t3", kind: "refused", reason });
    }
  }

  async persistAttachments(threadId: string, messageId: string, images: ImageUpload[]): Promise<AttachmentRef[]> {
    const result = await this.oneShot(RPC.persistAttachments, { threadId, messageId, attachments: images }, UPLOAD_TIMEOUT_MS);
    return read(PersistedAttachments, result, "assets.persistChatAttachments").attachments ?? [];
  }

  async ensureScratchProject(): Promise<string> {
    return read(ScratchProject, await this.call(RPC.ensureScratch, {}), "projects.ensureScratch").projectId;
  }

  // Not in IDEMPOTENT: the commandId stops a double create, but a retry would then fail on "already used".
  async mutateProject(mutation: ProjectMutation, commandId: string): Promise<RawProject> {
    const payload = mutation.type === "project.create" ? { ...mutation, commandId, defaultModelSelection: null } : { ...mutation, commandId };
    return read(RawProject, await this.call(RPC.mutateProject, payload), RPC.mutateProject);
  }

  async browseFolders(partialPath: string): Promise<{ parentPath: string; entries: Array<{ name: string; fullPath: string }> }> {
    return read(FolderBrowseResponse, await this.call(RPC.browseFolders, { partialPath }), RPC.browseFolders);
  }

  async pathKinds(paths: string[]): Promise<Array<string | null>> {
    const { entries } = read(PathMetadataResponse, await this.call(RPC.pathMetadata, { paths }), RPC.pathMetadata);
    return paths.map((_, i) => entries[i]?.kind ?? null);
  }

  async fetchAsset(resource: AssetResource, range?: string): Promise<{ response: Response; fileName: string }> {
    const { relativeUrl } = read(AssetUrl, await this.call(RPC.createAssetUrl, { resource }), "assets.createUrl");
    const response = await this.fetchImpl(`${(await this.baseUrl()).replace(/\/+$/, "")}${relativeUrl}`, { headers: range ? { range } : {}, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    if (response.status === 404) throw new IntegrationError("Attachment not found", { system: "t3", kind: "refused" });
    if (!response.ok) throw new IntegrationError(`T3 answered ${response.status} for an asset`, { system: "t3", kind: "unreachable" });
    return { response, fileName: decodeURIComponent(relativeUrl.split("/").at(-1) ?? "") };
  }

  dispatch(command: Command): Promise<unknown> {
    return this.call(RPC.dispatch, command);
  }

  /** Closes the shared socket. The next call opens a new one. */
  close(): void {
    const shared = this.shared;
    this.shared = null;
    void shared?.conn.then((conn) => conn.close(), () => {});
  }

  subscribeShell(onItems: (items: ShellItem[]) => void, onEnd: (error?: Error) => void): { cancel(): void } {
    let connection: RpcConnection | undefined;
    let cancelStream: (() => void) | undefined;
    let cancelled = false;
    const finish = (error?: Error) => {
      connection?.close();
      if (!cancelled) onEnd(error);
    };
    this.openSocket().then(
      (opened) => {
        connection = opened;
        if (cancelled) return opened.close();
        // Without the marker T3 never sends `synchronized`, and the store would never commit.
        const payload = { requestCompletionMarker: true };
        cancelStream = opened.stream(RPC.subscribeShell, payload, (values) => onItems(this.checkShell(values)), finish).cancel;
      },
      (error: Error) => finish(error),
    );
    return {
      cancel() {
        cancelled = true;
        cancelStream?.();
        connection?.close();
      },
    };
  }

  subscribeScheduledTasks(onTasks: (tasks: RawScheduledTask[]) => void, onEnd: (error?: Error) => void): { cancel(): void } {
    let connection: RpcConnection | undefined;
    let cancelStream: (() => void) | undefined;
    let cancelled = false;
    const finish = (error?: Error) => {
      connection?.close();
      if (!cancelled) onEnd(error);
    };
    // A wrong snapshot is skipped, never thrown: the guard must keep running.
    const receive = (values: unknown[]) => {
      for (const value of values) {
        const found = issues(ScheduledTasksResponse, value);
        if (found.length > 0) {
          const message = `T3 contract: ${RPC.subscribeScheduledTasks} ${describe(found[0]!)}`;
          if (!this.warned.has(message)) {
            this.warned.add(message);
            this.warn(message);
          }
          continue;
        }
        onTasks((value as { tasks: RawScheduledTask[] }).tasks);
      }
    };
    this.openSocket().then(
      (opened) => {
        connection = opened;
        if (cancelled) return opened.close();
        cancelStream = opened.stream(RPC.subscribeScheduledTasks, {}, receive, finish).cancel;
      },
      (error: Error) => finish(error),
    );
    return {
      cancel() {
        cancelled = true;
        cancelStream?.();
        connection?.close();
      },
    };
  }

  // One ticket per socket: T3 refuses to reuse it.
  async openSocket(): Promise<RpcConnection> {
    const { ticket } = read(WebSocketTicket, await this.http("POST", "/api/auth/websocket-ticket"), "websocket ticket");
    const query = new URLSearchParams({ wsTicket: ticket, orchestrationProtocol: ORCHESTRATION_PROTOCOL });
    const url = `${(await this.baseUrl()).replace(/^http/, "ws")}/ws?${query}`;
    return new RpcConnection(url, this.Socket);
  }

  // The stream never fails on a wrong item: a broken snapshot would empty the dashboard. It warns once per field.
  private checkShell(values: unknown[]): ShellItem[] {
    for (const issue of values.flatMap((value) => issues(ShellItem, value))) {
      const message = `T3 contract: orchestration.subscribeShell item ${describe(issue)}`;
      if (this.warned.has(message)) continue;
      this.warned.add(message);
      this.warn(message);
    }
    return values as ShellItem[];
  }

  // Calls share one socket (one ticket) instead of opening one per request.
  private async call(tag: string, payload: unknown, timeoutMs?: number): Promise<unknown> {
    const entry = await this.sharedSocket();
    const conn = await entry.conn;
    try {
      return await conn.request(tag, payload, timeoutMs);
    } catch (error) {
      if (error instanceof IntegrationError && error.kind === "refused") throw error;
      if (this.shared === entry) this.shared = null;
      // Timeout: the socket may be stuck, new calls take a fresh one.
      if (!conn.isClosed) throw error;
      // A command cut mid-flight may have reached T3: never send it twice.
      if (conn.isOpen && !IDEMPOTENT.has(tag)) throw error;
      return this.oneShot(tag, payload, timeoutMs);
    } finally {
      // A retired socket closes once its last request settles, so a timeout never fails the others.
      if (this.shared !== entry && !conn.isClosed && !conn.busy) conn.close();
    }
  }

  private async sharedSocket(): Promise<SharedSocket> {
    const token = this.token();
    const origin = await this.baseUrl();
    const current = this.shared;
    if (current) {
      const sameTarget = current.token === token && current.origin === origin;
      const conn = sameTarget ? await current.conn.catch(() => null) : null;
      if (conn && !conn.isClosed) return current;
      // Another caller may have replaced the entry while this one waited.
      if (this.shared !== current) return this.sharedSocket();
      this.shared = null;
      // A busy old socket closes in call() once its last request settles.
      if (!sameTarget) void current.conn.then((old) => !old.busy && old.close(), () => {});
    }
    const entry: SharedSocket = { conn: this.openSocket(), token, origin };
    this.shared = entry;
    entry.conn.catch(() => {
      if (this.shared === entry) this.shared = null;
    });
    return entry;
  }

  private async oneShot(tag: string, payload: unknown, timeoutMs?: number): Promise<unknown> {
    const connection = await this.openSocket();
    try {
      return await connection.request(tag, payload, timeoutMs);
    } finally {
      connection.close();
    }
  }

  /** The raw JSON answer: the contract check validates it with every issue, not just the first. */
  async http(method: "GET" | "POST", path: string): Promise<unknown> {
    const token = this.token();
    if (token === null) throw new IntegrationError("No T3 token yet", { system: "t3", kind: "not-authenticated" });
    let response: Response;
    let text: string;
    try {
      response = await this.fetchImpl((await this.baseUrl()) + path, {
        method,
        headers: { authorization: `Bearer ${token}`, "x-t3-orchestration-protocol": ORCHESTRATION_PROTOCOL },
      });
      text = await response.text();
    } catch (error) {
      throw new IntegrationError((error as Error).message, { system: "t3", kind: "unreachable" });
    }
    const { status } = response;
    if (!response.ok) throw new IntegrationError(`T3 answered ${status} on ${method} ${path}`, { system: "t3", kind: status === 401 || status === 403 ? "not-authenticated" : "refused", status });
    try {
      return text ? JSON.parse(text) : undefined;
    } catch {
      throw new IntegrationError(`Unreadable T3 response on ${method} ${path}`, { system: "t3", kind: "protocol" });
    }
  }

  private async baseUrl(): Promise<string> {
    return (await this.origin()).replace(/\/+$/, "");
  }
}
