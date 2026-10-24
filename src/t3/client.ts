import { RpcConnection } from "./rpc.ts";
import type { Command, RawConfig, RawProjection, ShellItem, T3Port } from "./types.ts";

const ORCHESTRATION_PROTOCOL = "2";

export interface T3ClientOptions {
  origin: () => Promise<string>;
  token: string;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
}

export class T3Client implements T3Port {
  private readonly origin: () => Promise<string>;
  private readonly token: string;
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
        cancelStream = opened.stream("orchestration.subscribeShell", {}, (values) => onItems(values as ShellItem[]), finish).cancel;
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

  private async oneShot(tag: string, payload: unknown): Promise<unknown> {
    const connection = await this.openSocket();
    try {
      return await connection.request(tag, payload);
    } finally {
      connection.close();
    }
  }

  private async http(method: "GET" | "POST", path: string): Promise<unknown> {
    const response = await this.fetchImpl((await this.baseUrl()) + path, {
      method,
      headers: { authorization: `Bearer ${this.token}`, "x-t3-orchestration-protocol": ORCHESTRATION_PROTOCOL },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`T3 answered ${response.status} on ${method} ${path}`);
    return text ? JSON.parse(text) : undefined;
  }

  private async baseUrl(): Promise<string> {
    return (await this.origin()).replace(/\/+$/, "");
  }
}
