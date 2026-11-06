import type { AutomationRun, AutomationRunOutcome } from "../../shared/automations.ts";
import { threadState } from "../../shared/status.ts";
import type { RawScheduledTask, RawThread } from "../integrations/t3/schemas.ts";
import { toDashboardThread } from "./classify.ts";

export type RunLog = Record<string, AutomationRun[]>;

const MAX_RUNS = 20;
// T3 stamps lastRunAt a little before or after it opens the thread of the run.
const NEAR_MS = 5 * 60_000;

const stamp = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);
const isBound = (task: RawScheduledTask) => task.threadId != null;
const isOpen = (status: AutomationRunOutcome) => status === "running" || status === "waiting";
const key = (task: RawScheduledTask, run: AutomationRun) => (isBound(task) || run.threadId === null ? `at:${run.startedAt}` : run.threadId);

// T3 puts no task id on a run thread: the project, title, origin and creation time tie it to its task.
export function runThreads(task: RawScheduledTask, threads: RawThread[]): RawThread[] {
  const since = stamp(task.createdAt);
  return threads
    .filter((thread) => thread.projectId === task.projectId && thread.title === task.title && thread.creationSource === task.creationSource && stamp(thread.createdAt) >= since)
    .sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt));
}

const gone = (thread: RawThread | undefined): thread is undefined => !thread || thread.archivedAt != null || thread.deletedAt != null;

/** The run a thread shows right now, with the end once it is over. */
function runOf(thread: RawThread, startedAt: string, now: Date): AutomationRun {
  const dashboard = toDashboardThread(thread, now);
  const state = threadState(dashboard);
  const status: AutomationRunOutcome = state === "waiting" ? "waiting" : state === "running" ? "running" : state === "error" ? "failed" : state === "done" || thread.latestRunCompletedAt ? "succeeded" : "unknown";
  const terminal = status === "succeeded" || status === "failed";
  return { threadId: thread.id, startedAt, finishedAt: terminal ? (thread.latestRunCompletedAt ?? dashboard.lastActivityAt) : null, status, error: status === "failed" ? dashboard.lastError : null };
}

function fromT3(task: RawScheduledTask, run: AutomationRun): AutomationRun {
  if (task.lastRunStatus !== "failed" || isOpen(run.status)) return run;
  return { ...run, status: "failed", error: task.lastRunError ?? run.error };
}

function taskRuns(task: RawScheduledTask, stored: AutomationRun[], threads: RawThread[], now: Date): AutomationRun[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const runs = new Map<string, AutomationRun>();
  const lastRunAt = stamp(task.lastRunAt);

  // A stored run still working with nothing to follow it may have ended unseen.
  for (const run of stored) runs.set(key(task, run), isOpen(run.status) ? { ...run, status: "unknown" } : run);

  if (isBound(task)) {
    const chat = byId.get(task.threadId!);
    if (task.lastRunAt) {
      const startedAt = task.lastRunAt;
      const kept = runs.get(`at:${startedAt}`);
      const base = !gone(chat) ? runOf(chat, startedAt, now) : (kept ?? { threadId: task.threadId!, startedAt, finishedAt: null, status: task.lastRunStatus === "succeeded" ? "succeeded" : "unknown", error: null });
      runs.set(`at:${startedAt}`, fromT3(task, base));
    }
  } else {
    let failedNear = false;
    for (const thread of runThreads(task, threads)) {
      if (gone(thread)) continue;
      const run = runOf(thread, thread.createdAt ?? "", now);
      const near = Math.abs(stamp(thread.createdAt) - lastRunAt) <= NEAR_MS;
      failedNear ||= near;
      runs.set(thread.id, near ? fromT3(task, run) : run);
    }
    if (task.lastRunStatus === "failed" && task.lastRunAt && !failedNear) {
      const dispatch: AutomationRun = { threadId: null, startedAt: task.lastRunAt, finishedAt: null, status: "failed", error: task.lastRunError ?? null };
      runs.set(key(task, dispatch), dispatch);
    }
  }
  return [...runs.values()].sort((a, b) => stamp(b.startedAt) - stamp(a.startedAt)).slice(0, MAX_RUNS);
}

/** The run log after one look at T3: runs of live threads are refreshed, the others are kept. Deleted tasks leave. */
export function recordRuns(log: RunLog, tasks: RawScheduledTask[], threads: RawThread[], now: Date): RunLog {
  return Object.fromEntries(tasks.map((task) => [task.id, taskRuns(task, log[task.id] ?? [], threads, now)]));
}

/** The in-memory run log of the dashboard, saved to disk only when it changes. */
export class AutomationRunLog {
  private log: RunLog;
  private text: string;
  private readonly persist: (log: RunLog) => void;
  private readonly warn: (message: string) => void;

  constructor(log: RunLog = {}, persist: (log: RunLog) => void = () => {}, warn: (message: string) => void = console.warn) {
    this.log = log;
    this.text = JSON.stringify(log);
    this.persist = persist;
    this.warn = warn;
  }

  current(): RunLog {
    return this.log;
  }

  record(next: RunLog): void {
    const text = JSON.stringify(next);
    if (text === this.text) return;
    this.log = next;
    this.text = text;
    // A write error (full or read-only disk) must not break the page: keep the log in memory.
    try {
      this.persist(next);
    } catch (error) {
      this.warn(`Could not save automation runs: ${(error as Error).message}`);
    }
  }

  drop(id: string): void {
    if (!(id in this.log)) return;
    const { [id]: _gone, ...rest } = this.log;
    this.record(rest);
  }
}
