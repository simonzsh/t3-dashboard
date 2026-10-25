import type {
  AssignIssueBody,
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
  ThreadDetail,
  ThreadSettingsBody,
  UpdateStatus,
} from "../../../shared/api.ts";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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
  return {
    getAutomations: () => call<AutomationsResult>("/api/automations"),
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
    getThread: (id: string) => call<ThreadDetail>(t(id)),
    createThread: (b: CreateThreadBody) => call<CreateThreadResult>("/api/threads", b),
    sendMessage: (id: string, b: SendMessageBody) => call<OkResult>(`${t(id)}/messages`, b),
    interrupt: (id: string) => call<OkResult>(`${t(id)}/interrupt`, {}),
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
