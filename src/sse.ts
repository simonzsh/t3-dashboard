import type { ServerResponse } from "node:http";
import type { DashboardEvent, DashboardProject, DashboardState, DashboardThread, Diff } from "../shared/api.ts";

export interface SseHubOptions {
  batchMs?: number;
  pingMs?: number;
}

class Pending<T extends { id: string }> {
  private readonly upserted = new Map<string, T>();
  private readonly removed = new Set<string>();

  merge(diff: Diff<T>): void {
    for (const item of diff.upserted) {
      this.upserted.set(item.id, item);
      this.removed.delete(item.id);
    }
    for (const id of diff.removed) {
      this.upserted.delete(id);
      this.removed.add(id);
    }
  }

  take(): Diff<T> | null {
    if (this.upserted.size === 0 && this.removed.size === 0) return null;
    const diff = { upserted: [...this.upserted.values()], removed: [...this.removed] };
    this.clear();
    return diff;
  }

  clear(): void {
    this.upserted.clear();
    this.removed.clear();
  }
}

interface Client {
  res: ServerResponse;
  threads: Pending<DashboardThread>;
  projects: Pending<DashboardProject>;
  timer: NodeJS.Timeout | null;
}

const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

/** Fans events out to the browsers; thread and project diffs are batched per client. */
export class SseHub {
  private readonly clients = new Set<Client>();
  private readonly batchMs: number;
  private readonly pinger: NodeJS.Timeout;

  constructor({ batchMs = 150, pingMs = 25_000 }: SseHubOptions = {}) {
    this.batchMs = batchMs;
    this.pinger = setInterval(() => {
      for (const client of this.clients) client.res.write(": ping\n\n");
    }, pingMs);
    this.pinger.unref();
  }

  add(res: ServerResponse, initialState: DashboardState): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.flushHeaders();
    res.write(frame("state", initialState));
    const client: Client = { res, threads: new Pending(), projects: new Pending(), timer: null };
    this.clients.add(client);
    res.on("close", () => this.drop(client));
  }

  broadcast(event: DashboardEvent): void {
    for (const client of this.clients) {
      if (event.type === "threads" || event.type === "projects") {
        (event.type === "threads" ? client.threads : client.projects).merge(event.data as Diff<never>);
        client.timer ??= setTimeout(() => this.flush(client), this.batchMs);
        continue;
      }
      // A full state already holds every pending change.
      if (event.type === "state") this.cancelBatch(client);
      client.res.write(frame(event.type, event.data));
    }
  }

  close(): void {
    clearInterval(this.pinger);
    for (const client of this.clients) {
      this.cancelBatch(client);
      client.res.end();
    }
    this.clients.clear();
  }

  private flush(client: Client): void {
    client.timer = null;
    const threads = client.threads.take();
    if (threads) client.res.write(frame("threads", threads));
    const projects = client.projects.take();
    if (projects) client.res.write(frame("projects", projects));
  }

  private cancelBatch(client: Client): void {
    if (client.timer) clearTimeout(client.timer);
    client.timer = null;
    client.threads.clear();
    client.projects.clear();
  }

  private drop(client: Client): void {
    this.cancelBatch(client);
    this.clients.delete(client);
  }
}
