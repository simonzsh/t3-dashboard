import { RUN_OUTCOMES, type AutomationRun, type AutomationRunOutcome } from "../../shared/automations.ts";
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

/** Thread id -> task id, as read from the first message of the thread. null: the thread has no task. Not listed: not read yet. */
export type ThreadLinks = ReadonlyMap<string, string | null>;

/** The task that owns a thread for good: the log of an unbound task keeps its thread ids, a probed link wins. */
export function threadOwners(tasks: RawScheduledTask[], log: RunLog, links: ThreadLinks = new Map()): Map<string, string> {
  const owners = new Map<string, string>();
  for (const task of tasks) {
    if (isBound(task)) continue;
    for (const run of log[task.id] ?? []) if (run.threadId !== null) owners.set(run.threadId, task.id);
  }
  for (const [threadId, taskId] of links) if (taskId !== null) owners.set(threadId, taskId);
  return owners;
}

// An owned thread belongs to its owner whatever its title. For the others the project, title, origin and creation time are a guess.
export function runThreads(task: RawScheduledTask, threads: RawThread[], owners: ReadonlyMap<string, string> = new Map()): RawThread[] {
  const since = stamp(task.createdAt);
  return threads
    .filter((thread) => {
      const owner = owners.get(thread.id);
      if (owner !== undefined) return owner === task.id;
      return thread.projectId === task.projectId && thread.title === task.title && thread.creationSource === task.creationSource && stamp(thread.createdAt) >= since;
    })
    .sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt));
}

const gone = (thread: RawThread | undefined): thread is undefined => !thread || thread.archivedAt != null || thread.deletedAt != null;

/** The run a thread shows right now, with the end once it is over. */
function runOf(thread: RawThread, startedAt: string, now: Date): AutomationRun {
  const dashboard = toDashboardThread(thread, now);
  const status: AutomationRunOutcome = RUN_OUTCOMES[threadState(dashboard)] ?? (thread.latestRunCompletedAt ? "succeeded" : "unknown");
  const terminal = status === "succeeded" || status === "failed";
  return { threadId: thread.id, startedAt, finishedAt: terminal ? (thread.latestRunCompletedAt ?? dashboard.lastActivityAt) : null, status, error: status === "failed" ? dashboard.lastError : null };
}

/** An unseen end filled in from T3's last-run status, when T3 knows it. */
function endedAs(task: RawScheduledTask, run: AutomationRun): AutomationRun {
  if (task.lastRunStatus === "succeeded") return { ...run, status: "succeeded" };
  if (task.lastRunStatus === "failed") return { ...run, status: "failed", error: task.lastRunError ?? run.error };
  return run;
}

function fromT3(task: RawScheduledTask, run: AutomationRun): AutomationRun {
  if (task.lastRunStatus !== "failed" || isOpen(run.status)) return run;
  return { ...run, status: "failed", error: task.lastRunError ?? run.error };
}

// A thread ends "done" after a timeout or interrupt: a failure seen once must not turn into a success.
function keepFailure(prev: AutomationRun | undefined, run: AutomationRun): AutomationRun {
  return prev?.status === "failed" && run.status === "succeeded" ? { ...run, status: "failed", error: prev.error } : run;
}

function taskRuns(task: RawScheduledTask, log: AutomationRun[], threads: RawThread[], owners: ReadonlyMap<string, string>, links: ThreadLinks, now: Date): AutomationRun[] {
  // A probed task id beats a stored link: the thread leaves the runs of any other task.
  const stored = isBound(task) ? log : log.filter((run) => run.threadId === null || (links.get(run.threadId) ?? task.id) === task.id);
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const runs = new Map<string, AutomationRun>();
  const lastRunAt = stamp(task.lastRunAt);

  const isNear = (iso: string | null | undefined) => task.lastRunAt != null && Math.abs(stamp(iso) - lastRunAt) <= NEAR_MS;
  // A stored run still working with nothing to follow it may have ended unseen (its thread archived meanwhile).
  // When it is T3's last run, T3's own status says how it ended.
  for (const run of stored) {
    const settled: AutomationRun = isOpen(run.status) ? { ...run, status: "unknown" } : run;
    runs.set(key(task, run), settled.status === "unknown" && isNear(run.startedAt) ? endedAs(task, settled) : settled);
  }

  if (isBound(task)) {
    const chat = byId.get(task.threadId!);
    if (task.lastRunAt) {
      const startedAt = task.lastRunAt;
      const kept = runs.get(`at:${startedAt}`);
      const base = !gone(chat) ? runOf(chat, startedAt, now) : (kept ?? { threadId: task.threadId!, startedAt, finishedAt: null, status: task.lastRunStatus === "succeeded" ? "succeeded" : "unknown", error: null });
      runs.set(`at:${startedAt}`, keepFailure(kept, fromT3(task, base)));
    }
  } else {
    // A run already logged near lastRunAt (its thread may be archived since) is the failed run, not a dispatch failure.
    let failedNear = stored.some((run) => run.threadId !== null && isNear(run.startedAt));
    for (const thread of runThreads(task, threads, owners)) {
      const near = isNear(thread.createdAt);
      failedNear ||= near;
      if (gone(thread)) continue;
      const run = runOf(thread, thread.createdAt ?? "", now);
      runs.set(thread.id, keepFailure(runs.get(thread.id), near ? fromT3(task, run) : run));
    }
    if (task.lastRunStatus === "failed" && task.lastRunAt && !failedNear) {
      const dispatch: AutomationRun = { threadId: null, startedAt: task.lastRunAt, finishedAt: null, status: "failed", error: task.lastRunError ?? null };
      runs.set(key(task, dispatch), dispatch);
    }
  }
  return [...runs.values()].sort((a, b) => stamp(b.startedAt) - stamp(a.startedAt)).slice(0, MAX_RUNS);
}

/** The run log after one look at T3: runs of live threads are refreshed by thread id, the others are kept. Deleted tasks leave. */
export function recordRuns(log: RunLog, tasks: RawScheduledTask[], threads: RawThread[], now: Date, links: ThreadLinks = new Map()): RunLog {
  const owners = threadOwners(tasks, log, links);
  return Object.fromEntries(tasks.map((task) => [task.id, taskRuns(task, log[task.id] ?? [], threads, owners, links, now)]));
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
