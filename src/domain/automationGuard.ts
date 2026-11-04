import { setTimeout as delay } from "node:timers/promises";
import type { RawScheduledTask, T3Port } from "../integrations/t3/schemas.ts";
import { isReminder } from "./automations.ts";
import { BACKOFF_MS } from "./liveSync.ts";

export type GuardAction = { kind: "root" | "pause"; id: string; key: string };

const RUN_DONE = new Set(["succeeded", "failed"]);
// T3 stamps updatedAt when a run ends. A later stamp means someone changed the task after the
// run (re-enabled it, for example): the guard must not pause it again after a restart.
const RUN_END_SLACK_MS = 60 * 60 * 1000;
// A stream that drops at once does not count as a recovery: the backoff keeps growing.
const STABLE_STREAM_MS = 30_000;

function lastChangeIsTheRun(task: RawScheduledTask): boolean {
  if (!task.updatedAt || !task.lastRunAt) return true;
  return Date.parse(task.updatedAt) - Date.parse(task.lastRunAt) <= RUN_END_SLACK_MS;
}

/** What to fix in a snapshot. A key in `done` was already tried: each state gets one attempt. */
export function guardActions(tasks: RawScheduledTask[], done: ReadonlySet<string> = new Set()): GuardAction[] {
  const actions: GuardAction[] = [];
  for (const task of tasks) {
    if (task.workspaceStrategy?.type === "worktree") {
      actions.push({ kind: "root", id: task.id, key: `root:${task.id}:${task.updatedAt ?? ""}:${JSON.stringify(task.workspaceStrategy)}` });
    }
    const ran = (task.runCount ?? (task.lastRunAt ? 1 : 0)) >= 1;
    if (task.enabled !== false && isReminder(task) && RUN_DONE.has(task.lastRunStatus ?? "") && ran && lastChangeIsTheRun(task)) {
      actions.push({ kind: "pause", id: task.id, key: `pause:${task.id}:${task.lastRunAt}` });
    }
  }
  return actions.filter((action) => !done.has(action.key));
}

export interface AutomationGuardOptions {
  port: Pick<T3Port, "subscribeScheduledTasks" | "setScheduledTaskWorkspace" | "setScheduledTaskEnabled">;
  warn?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
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

  private readonly now: () => number;

  constructor({ port, warn = console.warn, sleep = (ms) => delay(ms, undefined, { ref: false }), now = Date.now }: AutomationGuardOptions) {
    this.port = port;
    this.now = now;
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
      const opened = this.now();
      let received = false;
      await new Promise<void>((resolve) => {
        this.endSession = resolve;
        this.current = this.port.subscribeScheduledTasks(
          (tasks) => {
            received = true;
            // A rejected handle would stop every later snapshot: catch it here.
            this.queue = this.queue.then(() => this.handle(tasks)).catch((error) => this.warn(`Automation guard failed: ${String((error as Error)?.message ?? error)}`));
          },
          () => resolve(),
        );
      });
      this.current?.cancel();
      if (received && this.now() - opened >= STABLE_STREAM_MS) attempt = 0;
      if (this.stopped) return;
      const woken = new Promise<void>((resolve) => (this.wake = resolve));
      await Promise.race([this.sleep(BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]!), woken]);
    }
  }

  private async handle(tasks: RawScheduledTask[]): Promise<void> {
    const wanted = guardActions(tasks);
    const live = new Set(wanted.map((action) => action.key));
    for (const key of this.done) if (!live.has(key)) this.done.delete(key);
    for (const { kind, id, key } of wanted.filter((action) => !this.done.has(action.key))) {
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
