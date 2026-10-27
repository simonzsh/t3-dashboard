import { IntegrationError } from "../errors.ts";

const unreachable = (message: string) => new IntegrationError(message, { system: "t3", kind: "unreachable" });

type SocketCtor = typeof WebSocket;

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface StreamEntry {
  onItems(values: unknown[]): void;
  onEnd(error?: Error): void;
}

interface Exit {
  _tag?: string;
  value?: unknown;
  cause?: unknown;
}

const PING_MS = 30_000;

// Effect wraps a typed failure as `{_tag: "Fail", error}`; dispatch errors carry commandType and message.
function describeCause(cause: unknown): string {
  const error = (cause as { error?: unknown } | null)?.error ?? cause;
  const { message, commandType } = (error ?? {}) as { message?: unknown; commandType?: unknown };
  if (typeof message !== "string") return JSON.stringify(cause);
  return typeof commandType === "string" ? `${commandType}: ${message}` : message;
}

/** Effect RPC over one WebSocket: unary requests and streams share the connection. */
export class RpcConnection {
  private readonly socket: WebSocket;
  private readonly pending = new Map<string, Pending>();
  private readonly streams = new Map<string, StreamEntry>();
  private readonly outbox: string[] = [];
  private readonly pinger: NodeJS.Timeout;
  private opened = false;
  private done = false;
  private nextId = 1;

  constructor(url: string, Socket: SocketCtor = globalThis.WebSocket) {
    this.socket = new Socket(url);
    this.socket.onopen = () => {
      this.opened = true;
      for (const frame of this.outbox.splice(0)) this.socket.send(frame);
    };
    this.socket.onmessage = (event) => this.onFrame(String(event.data));
    this.socket.onerror = () => this.fail(unreachable("T3 WebSocket error"));
    this.socket.onclose = () => this.fail(unreachable("T3 WebSocket closed"));
    this.pinger = setInterval(() => this.send({ _tag: "Ping" }), PING_MS);
    this.pinger.unref();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  get isClosed(): boolean {
    return this.done;
  }

  get busy(): boolean {
    return this.pending.size > 0 || this.streams.size > 0;
  }

  request(tag: string, payload: unknown, timeoutMs = 10_000): Promise<unknown> {
    if (this.done) return Promise.reject(unreachable("T3 WebSocket closed"));
    const id = this.newId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(unreachable(`T3 did not answer ${tag} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ _tag: "Request", id, tag, payload, headers: [] });
    });
  }

  stream(tag: string, payload: unknown, onItems: (values: unknown[]) => void, onEnd: (error?: Error) => void): { cancel(): void } {
    if (this.done) {
      queueMicrotask(() => onEnd(unreachable("T3 WebSocket closed")));
      return { cancel() {} };
    }
    const id = this.newId();
    this.streams.set(id, { onItems, onEnd });
    this.send({ _tag: "Request", id, tag, payload, headers: [] });
    return {
      cancel: () => {
        if (!this.streams.delete(id)) return;
        this.send({ _tag: "Interrupt", requestId: id });
      },
    };
  }

  close(): void {
    this.fail(unreachable("T3 WebSocket closed"));
    this.socket.close();
  }

  private newId(): string {
    return String(this.nextId++);
  }

  private send(message: unknown): void {
    if (this.done) return;
    const frame = JSON.stringify(message);
    if (this.opened) this.socket.send(frame);
    else this.outbox.push(frame);
  }

  private onFrame(raw: string): void {
    let message: { _tag?: string; requestId?: string; values?: unknown[]; exit?: Exit };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const id = message.requestId ?? "";
    if (message._tag === "Chunk") {
      const entry = this.streams.get(id);
      if (!entry) return;
      entry.onItems(message.values ?? []);
      this.send({ _tag: "Ack", requestId: id });
    } else if (message._tag === "Exit") {
      this.onExit(id, message.exit);
    }
  }

  private onExit(id: string, exit: Exit | undefined): void {
    const failure = exit?._tag === "Success" ? undefined : new IntegrationError(`T3 refused the request: ${describeCause(exit?.cause)}`, { system: "t3", kind: "refused" });
    const request = this.pending.get(id);
    if (request) {
      this.pending.delete(id);
      clearTimeout(request.timer);
      if (failure) request.reject(failure);
      else request.resolve(exit?.value);
      return;
    }
    const entry = this.streams.get(id);
    if (!entry) return;
    this.streams.delete(id);
    entry.onEnd(failure);
  }

  private fail(error: Error): void {
    if (this.done) return;
    this.done = true;
    clearInterval(this.pinger);
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    const streams = [...this.streams.values()];
    this.streams.clear();
    for (const entry of streams) entry.onEnd(error);
  }
}
