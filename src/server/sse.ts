import type { DashboardEvent, DashboardProject, DashboardState, DashboardThread, Diff } from "../../shared/api.ts";
import { DiffBatch } from "../domain/diffBatch.ts";

export interface SseHubOptions {
  batchMs?: number;
  pingMs?: number;
}

type Client = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();
const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Fans events out to the browsers; thread and project diffs are batched once for all clients.
 * A client that joins mid-batch may get an item again: an upsert is idempotent in the web.
 */
export class SseHub {
  private readonly clients = new Set<Client>();
  private readonly threads = new DiffBatch<DashboardThread>();
  private readonly projects = new DiffBatch<DashboardProject>();
  private timer: NodeJS.Timeout | null = null;
  private readonly batchMs: number;
  private readonly pinger: NodeJS.Timeout;

  constructor({ batchMs = 150, pingMs = 25_000 }: SseHubOptions = {}) {
    this.batchMs = batchMs;
    this.pinger = setInterval(() => {
      for (const client of this.clients) this.write(client, ": ping\n\n");
    }, pingMs);
    this.pinger.unref();
  }

  add(initialState: DashboardState, signal: AbortSignal): Response {
    let client: Client;
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        client = controller;
        this.clients.add(client);
        this.write(client, frame("state", initialState));
      },
      cancel: () => this.drop(client),
    });
    signal.addEventListener("abort", () => this.drop(client), { once: true });
    return new Response(body, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" },
    });
  }

  broadcast(event: DashboardEvent): void {
    if (event.type === "threads" || event.type === "projects") {
      (event.type === "threads" ? this.threads : this.projects).merge(event.data as Diff<never>);
      this.timer ??= setTimeout(() => this.flush(), this.batchMs);
      return;
    }
    // A full state already holds every pending change.
    if (event.type === "state") this.cancelBatch();
    this.writeAll(frame(event.type, event.data));
  }

  close(): void {
    clearInterval(this.pinger);
    this.cancelBatch();
    for (const client of this.clients) client.close();
    this.clients.clear();
  }

  private flush(): void {
    this.timer = null;
    const threads = this.threads.take();
    if (threads) this.writeAll(frame("threads", threads));
    const projects = this.projects.take();
    if (projects) this.writeAll(frame("projects", projects));
  }

  private writeAll(text: string): void {
    for (const client of this.clients) this.write(client, text);
  }

  private write(client: Client, text: string): void {
    try {
      client.enqueue(encoder.encode(text));
    } catch {
      this.drop(client);
    }
  }

  private cancelBatch(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.threads.clear();
    this.projects.clear();
  }

  private drop(client: Client): void {
    this.clients.delete(client);
  }
}
