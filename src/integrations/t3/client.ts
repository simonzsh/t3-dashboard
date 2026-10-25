import { IntegrationError } from "../errors.ts";
import { RpcConnection } from "./rpc.ts";
import type { AttachmentRef, Command, ImageUpload, RawConfig, RawProjection, ShellItem, T3Port } from "./schemas.ts";

const ORCHESTRATION_PROTOCOL = "2";
// Images go up as data URLs of up to 10 MB each: give T3 time to write them.
const UPLOAD_TIMEOUT_MS = 60_000;

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
}

export class T3Client implements T3Port {
  private readonly origin: () => Promise<string>;
  private readonly token: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly Socket: typeof WebSocket;

  constructor({ origin, token, fetch = globalThis.fetch, WebSocket = globalThis.WebSocket }: T3ClientOptions) {
    this.origin = origin;
    this.token = token;
    this.fetchImpl = fetch;
    this.Socket = WebSocket;
  }

  async threadProjection(threadId: string): Promise<RawProjection> {
    const { projection } = (await this.http("GET", `/api/orchestration/threads/${encodeURIComponent(threadId)}`)) as { projection?: RawProjection };
    return projection ?? {};
  }

  async getConfig(): Promise<RawConfig> {
    return this.oneShot("server.getConfig", {}) as Promise<RawConfig>;
  }

  async persistAttachments(threadId: string, messageId: string, images: ImageUpload[]): Promise<AttachmentRef[]> {
    const result = (await this.oneShot("assets.persistChatAttachments", { threadId, messageId, attachments: images }, UPLOAD_TIMEOUT_MS)) as { attachments?: AttachmentRef[] };
    return result.attachments ?? [];
  }

  dispatch(command: Command): Promise<unknown> {
    return this.oneShot("orchestration.dispatchCommand", command);
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
        cancelStream = opened.stream("orchestration.subscribeShell", payload, (values) => onItems(values as ShellItem[]), finish).cancel;
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
    const { ticket } = (await this.http("POST", "/api/auth/websocket-ticket")) as { ticket: string };
    const query = new URLSearchParams({ wsTicket: ticket, orchestrationProtocol: ORCHESTRATION_PROTOCOL });
    const url = `${(await this.baseUrl()).replace(/^http/, "ws")}/ws?${query}`;
    return new RpcConnection(url, this.Socket);
  }

  private async oneShot(tag: string, payload: unknown, timeoutMs?: number): Promise<unknown> {
    const connection = await this.openSocket();
    try {
      return await connection.request(tag, payload, timeoutMs);
    } finally {
      connection.close();
    }
  }

  private async http(method: "GET" | "POST", path: string): Promise<unknown> {
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
