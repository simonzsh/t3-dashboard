import { setTimeout as delay } from "node:timers/promises";
import type { RawScheduledTask, T3Port } from "../integrations/t3/schemas.ts";
import { isReminder } from "./automations.ts";
import { BACKOFF_MS } from "./liveSync.ts";

export type GuardAction = { kind: "root" | "pause"; id: string; key: string };

const RUN_DONE = new Set(["succeeded", "failed"]);

/** What to fix in a snapshot. A key in `done` was already tried: each state gets one attempt. */
export function guardActions(tasks: RawScheduledTask[], done: ReadonlySet<string>): GuardAction[] {
  const actions: GuardAction[] = [];
  for (const task of tasks) {
    if (task.workspaceStrategy?.type === "worktree") {
      actions.push({ kind: "root", id: task.id, key: `root:${task.id}:${task.updatedAt ?? ""}:${JSON.stringify(task.workspaceStrategy)}` });
    }
    const ran = (task.runCount ?? (task.lastRunAt ? 1 : 0)) >= 1;
    if (task.enabled !== false && isReminder(task) && RUN_DONE.has(task.lastRunStatus ?? "") && ran) {
      actions.push({ kind: "pause", id: task.id, key: `pause:${task.id}:${task.lastRunAt}` });
    }
  }
  return actions.filter((action) => !done.has(action.key));
}

export interface AutomationGuardOptions {
  port: Pick<T3Port, "subscribeScheduledTasks" | "setScheduledTaskWorkspace" | "setScheduledTaskEnabled">;
  warn?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Keeps scheduled tasks out of worktrees (T3 opens a new one per run) and pauses a reminder
 * after its run, so a reminder never repeats and no prompt has to pause it.
 */
export class AutomationGuard {
  private readonly port: AutomationGuardOptions["port"];
  private readonly warn: (message: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly done = new Set<string>();
  private stopped = false;
  private current: { cancel(): void } | undefined;
  private endSession: (() => void) | undefined;
  private wake: (() => void) | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor({ port, warn = console.warn, sleep = (ms) => delay(ms, undefined, { ref: false }) }: AutomationGuardOptions) {
    this.port = port;
    this.warn = warn;
    this.sleep = sleep;
  }

  start(): void {
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.current?.cancel();
    this.endSession?.();
    this.wake?.();
  }

  /** Skips the wait and subscribes now. Call it after the token or T3 changed. */
  retryNow(): void {
    this.wake?.();
  }

  private async run(): Promise<void> {
    let attempt = 0;
    while (!this.stopped) {
      await new Promise<void>((resolve) => {
        this.endSession = resolve;
        this.current = this.port.subscribeScheduledTasks(
          (tasks) => {
            attempt = 0;
            this.queue = this.queue.then(() => this.handle(tasks));
          },
          () => resolve(),
        );
      });
      this.current?.cancel();
      if (this.stopped) return;
      const woken = new Promise<void>((resolve) => (this.wake = resolve));
      await Promise.race([this.sleep(BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]!), woken]);
    }
  }

  private async handle(tasks: RawScheduledTask[]): Promise<void> {
    const prefixes = tasks.flatMap((task) => [`root:${task.id}:`, `pause:${task.id}:`]);
    for (const key of this.done) if (!prefixes.some((prefix) => key.startsWith(prefix))) this.done.delete(key);
    for (const { kind, id, key } of guardActions(tasks, this.done)) {
      this.done.add(key);
      try {
        if (kind === "root") await this.port.setScheduledTaskWorkspace(id, { type: "root" });
        else await this.port.setScheduledTaskEnabled(id, false);
      } catch (error) {
        this.warn(kind === "root" ? `Could not move scheduled task ${id} to the project folder: ${(error as Error).message}` : `Could not pause reminder ${id}: ${(error as Error).message}`);
      }
    }
  }
}
