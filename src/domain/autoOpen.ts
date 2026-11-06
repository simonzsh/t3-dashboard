import type { AutomationsResult, DashboardThread, SessionsUpdate, SharedSessions } from "../../shared/api.ts";
import { SESSIONS_MAX } from "../../shared/sessions.ts";
import type { SessionsStore } from "./sessionsStore.ts";

export interface AutoOpenOptions {
  sessions: Pick<SessionsStore, "get" | "set">;
  /** The ids of automation threads, which never open by themselves: see automationThreadIds. */
  excluded(): Promise<ReadonlySet<string>>;
  broadcast(update: SessionsUpdate): void;
  warn?: (message: string) => void;
}

/** Threads an automation runs in never open by themselves: run and setup threads, and a task's own thread (a webhook posting in its conversation). */
export function automationThreadIds({ automations, hiddenThreadIds, setupThreadIds }: AutomationsResult): Set<string> {
  const bound = automations.flatMap((a) => (a.bound && a.threadId ? [a.threadId] : []));
  return new Set([...hiddenThreadIds, ...setupThreadIds, ...bound]);
}

/** Marks the `sessions` events that the server itself sends, so no browser treats one as its own echo. */
const AUTO_OPEN_ORIGIN = "server";

/**
 * Adds a thread to the shared sessions when a new run starts on it. The last run per thread stays in memory:
 * a closed session comes back only with a new run id. A restart forgets it, so the threads that run then open once.
 * When the sessions are full, the new thread is skipped: an open session is never dropped.
 */
export class AutoOpen {
  private readonly options: AutoOpenOptions;
  private readonly lastRun = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(options: AutoOpenOptions) {
    this.options = options;
  }

  observe(threads: Iterable<DashboardThread>): void {
    const started: string[] = [];
    for (const { id, activeRunId } of threads) {
      if (activeRunId === null || this.lastRun.get(id) === activeRunId) continue;
      started.push(id);
      this.lastRun.set(id, activeRunId);
    }
    if (started.length > 0) this.queue = this.queue.then(() => this.open(started));
  }

  forget(ids: Iterable<string>): void {
    for (const id of ids) this.lastRun.delete(id);
  }

  private async open(started: string[]): Promise<void> {
    let excluded: ReadonlySet<string>;
    try {
      excluded = await this.options.excluded();
    } catch (error) {
      // Forget the runs, so the next update tries again.
      this.forget(started);
      (this.options.warn ?? console.warn)(`Could not open the running sessions: ${(error as Error).message}`);
      return;
    }
    const current: SharedSessions = this.options.sessions.get() ?? { ids: [] };
    const known = new Set(current.ids);
    const added = started.filter((id) => !excluded.has(id) && !known.has(id));
    const ids = [...current.ids, ...added].slice(0, SESSIONS_MAX);
    if (ids.length === current.ids.length) return;
    const sessions = { ids };
    this.options.sessions.set(sessions);
    this.options.broadcast({ sessions, origin: AUTO_OPEN_ORIGIN });
  }
}
