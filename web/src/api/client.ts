import type {
  AssignIssueBody,
  AutomationRequestBody,
  AutomationsResult,
  BoardResult,
  ConnectionStatus,
  CreateThreadBody,
  CreateThreadResult,
  HealthResult,
  OkResult,
  RespondBody,
  SendMessageBody,
  SettingsResult,
  ThreadSearchResult,
  ThreadDetail,
  ThreadSettingsBody,
  UpdateStatus,
} from "../../../shared/api.ts";

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
      throw new Error(typeof msg === "string" ? msg : `Error ${res.status}`);
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
        throw new Error(typeof msg === "string" ? msg : `Error ${res.status}`);
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
  // A finished run's diff never changes: one call per run.
  const diffs = new Map<string, Promise<{ diff: string }>>();
  function getRunDiff(id: string, ordinal: number): Promise<{ diff: string }> {
    const key = `${id}:${ordinal}`;
    let diff = diffs.get(key);
    if (!diff) {
      diff = call<{ diff: string }>(`${t(id)}/runs/${ordinal}/diff`);
      diffs.set(key, diff);
      diff.catch(() => diffs.delete(key));
    }
    return diff;
  }
  return {
    getAutomations: () => call<AutomationsResult>("/api/automations"),
    requestAutomation: (b: AutomationRequestBody) => call<CreateThreadResult>("/api/automations", b),
    deleteAutomation: (id: string) => call<OkResult>(`/api/automations/${encodeURIComponent(id)}/delete`, {}),
    getBoard: (refresh = false) => call<BoardResult>(refresh ? "/api/board?refresh=1" : "/api/board"),
    assignIssue: (b: AssignIssueBody) => call<CreateThreadResult>("/api/board/assign", b),
    getSettings: () => call<SettingsResult>("/api/settings"),
    retrySetup: () => call<ConnectionStatus>("/api/setup/retry", {}),
    pasteToken: (token: string) => call<ConnectionStatus>("/api/setup/token", { token }),
    connectLinear: (apiKey: string) => call<SettingsResult>("/api/settings/linear/key", { apiKey }),
    disconnectLinear: () => call<SettingsResult>("/api/settings/linear/disconnect", {}),
    getUpdate: () => call<UpdateStatus>("/api/update"),
    checkUpdate: () => call<UpdateStatus>("/api/update/check", {}),
    applyUpdate: () => call<UpdateStatus>("/api/update/apply", {}),
    getHealth: () => call<HealthResult>("/api/health"),
    searchThreads: (query: string, limit?: number) =>
      call<ThreadSearchResult>(`/api/search?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ""}`),
    getThread,
    getRunDiff,
    createThread: (b: CreateThreadBody) => call<CreateThreadResult>("/api/threads", b),
    sendMessage: (id: string, b: SendMessageBody) => call<OkResult>(`${t(id)}/messages`, b),
    settle: (id: string) => call<OkResult>(`${t(id)}/settle`, {}),
    unsettle: (id: string) => call<OkResult>(`${t(id)}/unsettle`, {}),
    interrupt: (id: string) => call<OkResult>(`${t(id)}/interrupt`, {}),
    stopSubagent: (id: string, subagentId: string) => call<OkResult>(`${t(id)}/subagents/${encodeURIComponent(subagentId)}/stop`, {}),
    updateSettings: (id: string, b: ThreadSettingsBody) => call<OkResult>(`${t(id)}/settings`, b),
    respond: (id: string, requestId: string, b: RespondBody) =>
      call<OkResult>(`${t(id)}/requests/${encodeURIComponent(requestId)}/respond`, b),
    dismiss: (id: string, requestId: string) => call<OkResult>(`${t(id)}/requests/${encodeURIComponent(requestId)}/dismiss`, {}),
  };
}

export type Api = ReturnType<typeof createApi>;

// Plain URLs: <img> and <iframe> load them, no fetch involved.
const threadPath = (id: string) => `/api/threads/${encodeURIComponent(id)}`;
export const attachmentUrl = (threadId: string, attachmentId: string, theme?: string) =>
  `${threadPath(threadId)}/attachments/${encodeURIComponent(attachmentId)}${theme ? `?theme=${theme}` : ""}`;
export const mediaUrl = (threadId: string, path: string) => `${threadPath(threadId)}/media?path=${encodeURIComponent(path)}`;

export const api = createApi((input, init) => globalThis.fetch(input, init));
