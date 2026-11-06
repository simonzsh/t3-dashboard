import type {
  AssignIssueBody,
  AutomationsResult,
  BoardResult,
  ConnectionStatus,
  CreateThreadBody,
  CreateAutomationBody,
  UpdateAutomationBody,
  CreateAutomationResult,
  CreateThreadResult,
  SeenChange,
  SeenResult,
  SeenState,
  SessionsUpdate,
  SharedSessions,
  HealthResult,
  OkResult,
  RespondBody,
  SecretAnswerBody,
  EditQueuedBody,
  RewindBody,
  ComposerCommands,
  FileSearchResult,
  SendMessageBody,
  SettingsResult,
  StashBody,
  StashCreated,
  StashList,
  StepDetail,
  ThreadSearchResult,
  ThreadDetail,
  ThreadSettingsBody,
  UpdateStatus,
  UploadBody,
  UploadResult,
  LimitsOverview,
  ServerStats,
  UsageOverview,
} from "../../../shared/api.ts";

// The server sends its own message when it has one; these cover the rest.
export function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return "The dashboard refused this request. Reload the page and try again.";
  if (status === 404) return "This item no longer exists. It may have been deleted.";
  if (status === 408 || status === 504) return "The server took too long to answer. Try again in a moment.";
  if (status === 429) return "Too many requests. Wait a few seconds and try again.";
  if (status >= 500) return "The dashboard server hit an error. Try again; if it keeps failing, check the server logs.";
  return `The request failed (HTTP ${status}). Try again.`;
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const THREAD_CACHE_MAX = 50;
// Thread loads share one flight: a request that never answers would freeze the window.
const THREAD_TIMEOUT_MS = 30_000;

export function createApi(fetchImpl: Fetch) {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit =
      body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetchImpl(path, init);
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data as { error?: unknown } | null)?.error;
      throw new Error(typeof msg === "string" && msg ? msg : httpErrorMessage(res.status));
    }
    return data as T;
  }
  const t = (id: string) => `/api/threads/${encodeURIComponent(id)}`;
  // A 304 returns the same object, so memoized views see no change.
  const threads = new Map<string, { etag: string; detail: ThreadDetail }>();
  async function getThread(id: string): Promise<ThreadDetail> {
    const path = t(id);
    for (let attempt = 0; ; attempt++) {
      const known = threads.get(id);
      const signal = AbortSignal.timeout(THREAD_TIMEOUT_MS);
      const res = await fetchImpl(path, known ? { headers: { "if-none-match": known.etag }, signal } : { signal });
      if (res.status === 304 && known) return known.detail;
      // A 304 we cannot match is retried once without the header.
      if (res.status === 304 && attempt === 0) {
        threads.delete(id);
        continue;
      }
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data as { error?: unknown } | null)?.error;
        throw new Error(typeof msg === "string" && msg ? msg : httpErrorMessage(res.status));
      }
      const detail = data as ThreadDetail;
      const etag = res.headers.get("etag");
      threads.delete(id);
      if (etag) {
        threads.set(id, { etag, detail });
        if (threads.size > THREAD_CACHE_MAX) threads.delete(threads.keys().next().value!);
      }
      return detail;
    }
  }
  return {
    getAutomations: () => call<AutomationsResult>("/api/automations"),
    createAutomation: (b: CreateAutomationBody) => call<CreateAutomationResult>("/api/automations", b),
    updateAutomation: (id: string, b: UpdateAutomationBody) => call<OkResult>(`/api/automations/${encodeURIComponent(id)}/update`, b),
    deleteAutomation: (id: string) => call<OkResult>(`/api/automations/${encodeURIComponent(id)}/delete`, {}),
    getBoard: (refresh = false) => call<BoardResult>(refresh ? "/api/board?refresh=1" : "/api/board"),
    getUsage: (timeZone: string, refresh = false) => call<UsageOverview>(`/api/usage?tz=${encodeURIComponent(timeZone)}${refresh ? "&refresh=1" : ""}`),
    getServerStats: () => call<ServerStats>("/api/server-stats"),
    getLimits: (refresh = false) => call<LimitsOverview>(refresh ? "/api/limits?refresh=1" : "/api/limits"),
    assignIssue: (b: AssignIssueBody) => call<CreateThreadResult>("/api/board/assign", b),
    getSettings: () => call<SettingsResult>("/api/settings"),
    retrySetup: () => call<ConnectionStatus>("/api/setup/retry", {}),
    pasteToken: (token: string) => call<ConnectionStatus>("/api/setup/token", { token }),
    connectLinear: (apiKey: string) => call<SettingsResult>("/api/settings/linear/key", { apiKey }),
    disconnectLinear: () => call<SettingsResult>("/api/settings/linear/disconnect", {}),
    getSessions: () => call<{ sessions: SharedSessions | null }>("/api/sessions"),
    saveSessions: (update: SessionsUpdate) => call<OkResult>("/api/sessions", update),
    getStash: () => call<StashList>("/api/stash"),
    createStash: (b: StashBody) => call<StashCreated>("/api/stash", b),
    deleteStash: (id: string) => call<OkResult>(`/api/stash/${encodeURIComponent(id)}/delete`, {}),
    getSeen: () => call<{ seen: SeenState | null }>("/api/seen"),
    markSeen: (change: SeenChange) => call<SeenResult>("/api/seen", change),
    getUpdate: () => call<UpdateStatus>("/api/update"),
    checkUpdate: () => call<UpdateStatus>("/api/update/check", {}),
    applyUpdate: () => call<UpdateStatus>("/api/update/apply", {}),
    getHealth: () => call<HealthResult>("/api/health"),
    searchThreads: (query: string, limit?: number) =>
      call<ThreadSearchResult>(`/api/search?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ""}`),
    getThread,
    getStepDetail: (id: string, itemId: string) => call<StepDetail>(`${t(id)}/items/${encodeURIComponent(itemId)}`),
    searchFiles: (id: string, query: string, limit?: number) => call<FileSearchResult>(`${t(id)}/files?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ""}`),
    getComposerCommands: (id: string, provider: string) => call<ComposerCommands>(`${t(id)}/commands?provider=${encodeURIComponent(provider)}`),
    uploadAttachment: (b: UploadBody) => call<UploadResult>("/api/attachments", b),
    deleteAttachment: (attachmentId: string) => call<OkResult>(`/api/attachments/${encodeURIComponent(attachmentId)}/delete`, {}),
    createThread: (b: CreateThreadBody) => call<CreateThreadResult>("/api/threads", b),
    sendMessage: (id: string, b: SendMessageBody) => call<OkResult>(`${t(id)}/messages`, b),
    settle: (id: string) => call<OkResult>(`${t(id)}/settle`, {}),
    unsettle: (id: string) => call<OkResult>(`${t(id)}/unsettle`, {}),
    sendQueued: (id: string, runId: string) => call<OkResult>(`${t(id)}/queue/${encodeURIComponent(runId)}/send`, {}),
    editQueued: (id: string, runId: string, text: string) => call<OkResult>(`${t(id)}/queue/${encodeURIComponent(runId)}/edit`, { text } satisfies EditQueuedBody),
    cancelQueued: (id: string, runId: string) => call<OkResult>(`${t(id)}/queue/${encodeURIComponent(runId)}/cancel`, {}),
    rewind: (id: string, b: RewindBody) => call<OkResult>(`${t(id)}/rewind`, b),
    interrupt: (id: string) => call<OkResult>(`${t(id)}/interrupt`, {}),
    stopSubagent: (id: string, subagentId: string) => call<OkResult>(`${t(id)}/subagents/${encodeURIComponent(subagentId)}/stop`, {}),
    updateSettings: (id: string, b: ThreadSettingsBody) => call<OkResult>(`${t(id)}/settings`, b),
    respond: (id: string, requestId: string, b: RespondBody) =>
      call<OkResult>(`${t(id)}/requests/${encodeURIComponent(requestId)}/respond`, b),
    answerSecret: (id: string, itemId: string, b: SecretAnswerBody) => call<OkResult>(`${t(id)}/secrets/${encodeURIComponent(itemId)}`, b),
    dismiss: (id: string, requestId: string) => call<OkResult>(`${t(id)}/requests/${encodeURIComponent(requestId)}/dismiss`, {}),
  };
}

export type Api = ReturnType<typeof createApi>;

// Plain URLs: <img> and <iframe> load them, no fetch involved.
const threadPath = (id: string) => `/api/threads/${encodeURIComponent(id)}`;
export const attachmentUrl = (threadId: string, attachmentId: string, theme?: string) =>
  `${threadPath(threadId)}/attachments/${encodeURIComponent(attachmentId)}${theme ? `?theme=${theme}` : ""}`;
/** The file as it was sent, never themed as a page. */
export const rawAttachmentUrl = (threadId: string, attachmentId: string) => `${attachmentUrl(threadId, attachmentId)}?raw=1`;
/** The file for a frame: a PDF or a text file shows in the page instead of downloading. */
export const inlineAttachmentUrl = (threadId: string, attachmentId: string) => `${attachmentUrl(threadId, attachmentId)}?inline=1`;
export const mediaUrl = (threadId: string, path: string) => `${threadPath(threadId)}/media?path=${encodeURIComponent(path)}`;

export const api = createApi((input, init) => globalThis.fetch(input, init));
