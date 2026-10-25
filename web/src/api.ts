import type {
  AssignIssueBody,
  AutomationsResult,
  BoardResult,
  CreateThreadBody,
  CreateThreadResult,
  DashboardState,
  OkResult,
  RespondBody,
  SendMessageBody,
  ThreadDetail,
} from "../../shared/api.ts";

type Fetch = typeof globalThis.fetch;

export function createApi(fetchImpl: Fetch) {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit =
      body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetchImpl(path, init);
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data as { error?: unknown } | null)?.error;
      throw new Error(typeof msg === "string" ? msg : `Erreur ${res.status}`);
    }
    return data as T;
  }
  const t = (id: string) => `/api/threads/${encodeURIComponent(id)}`;
  return {
    getState: () => call<DashboardState>("/api/state"),
    getAutomations: () => call<AutomationsResult>("/api/automations"),
    getBoard: (refresh = false) => call<BoardResult>(refresh ? "/api/board?refresh=1" : "/api/board"),
    assignIssue: (b: AssignIssueBody) => call<CreateThreadResult>("/api/board/assign", b),
    getThread: (id: string) => call<ThreadDetail>(t(id)),
    createThread: (b: CreateThreadBody) => call<CreateThreadResult>("/api/threads", b),
    sendMessage: (id: string, b: SendMessageBody) => call<OkResult>(`${t(id)}/messages`, b),
    interrupt: (id: string) => call<OkResult>(`${t(id)}/interrupt`, {}),
    archive: (id: string) => call<OkResult>(`${t(id)}/archive`, {}),
    pin: (id: string) => call<OkResult>(`${t(id)}/pin`, {}),
    unpin: (id: string) => call<OkResult>(`${t(id)}/unpin`, {}),
    respond: (id: string, requestId: string, b: RespondBody) =>
      call<OkResult>(`${t(id)}/requests/${encodeURIComponent(requestId)}/respond`, b),
    dismiss: (id: string, requestId: string) => call<OkResult>(`${t(id)}/requests/${encodeURIComponent(requestId)}/dismiss`, {}),
  };
}

export const api = createApi((input, init) => globalThis.fetch(input, init));
