import type { Automation, AutomationRun, AutomationRunOutcome, DashboardProvider, DashboardThread, ModelSelection } from "../../../../shared/api.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { ACTIVE_STATUSES, threadState, type ThreadState } from "../../../../shared/status.ts";
import { MONTHS } from "../../lib/format.ts";
import { findModel } from "../conversation/composer.ts";

export type LastRun = { kind: "waiting" } | { kind: "running" } | { kind: "failed"; error: string | null } | { kind: "done"; at: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

// A setup thread shows as a row only while the agent works or waits; idle with no task, it returns to the Dashboard lists.
export function setupThreads(threads: DashboardThread[], setupThreadIds: readonly string[]): DashboardThread[] {
  const byId = new Map(threads.map((t) => [t.id, t]));
  return setupThreadIds.flatMap((id) => {
    const t = byId.get(id);
    return t && (ACTIVE_STATUSES.has(t.status) || t.pending) ? [t] : [];
  });
}

// Setup threads that were active and no longer are: their task may exist, but the list does not know it yet.
export function finishedSetups(wasActive: ReadonlySet<string>, active: readonly DashboardThread[]): string[] {
  const still = new Set(active.map((t) => t.id));
  return [...wasActive].filter((id) => !still.has(id));
}

// A reminder disables itself after its run instead of deleting itself, so the table can show it as finished.
export const isFinishedReminder = (a: Automation): boolean => a.kind === "reminder" && !a.enabled && a.lastRunAt !== null;

// The form only knows a routine schedule and a webhook signature it can read: saving anything else would overwrite it with defaults.
export function isEditable(a: Automation): boolean {
  if (a.kind === "routine") return a.schedule !== null;
  if (a.kind === "webhook") return !(a.webhook?.signed && !a.webhook.signature);
  return true;
}

export type AutomationGroup = "running" | "attention" | "upcoming" | "paused" | "finished";

type Threads = ReadonlyMap<string, DashboardThread>;

const OUTCOMES: Record<ThreadState, AutomationRunOutcome | null> = { waiting: "waiting", running: "running", error: "failed", done: "succeeded", idle: null };

/** The run with its thread laid over it; an idle thread says nothing, so the stored status stays. */
export function liveRun(run: AutomationRun, thread: DashboardThread | undefined): AutomationRun {
  const status = thread && OUTCOMES[threadState(thread)];
  if (!thread || !status) return run;
  const terminal = status === "succeeded" || status === "failed";
  return { ...run, status, error: status === "failed" ? (thread.lastError ?? run.error) : run.error, finishedAt: terminal ? (run.finishedAt ?? thread.lastActivityAt) : run.finishedAt };
}

/** A bound task runs in one thread: only its newest run follows that thread. */
export function liveRuns(a: Automation, threads: Threads): AutomationRun[] {
  return a.runs.map((run, i) => (a.bound && i > 0 ? run : liveRun(run, run.threadId ? threads.get(run.threadId) : undefined)));
}

export const latestFinished = (a: Automation, threads: Threads): AutomationRun | null => liveRuns(a, threads).find((r) => r.status === "succeeded" || r.status === "failed") ?? null;

/** What the Automations tab counts: tasks whose latest finished run is still unread. A red dot shows when one of them failed. */
export function automationsBadge(list: Automation[], threads: Threads, seen: SeenState): { count: number; failed: boolean } {
  let count = 0;
  let failed = false;
  for (const a of list) {
    const run = latestFinished(a, threads);
    const thread = run?.threadId ? threads.get(run.threadId) : undefined;
    if (!run || !thread || !isUnseen(thread, seen)) continue;
    count++;
    failed ||= run.status === "failed";
  }
  return { count, failed };
}

export function recentRuns(list: Automation[], threads: Threads, limit = 10): Array<{ automation: Automation; run: AutomationRun }> {
  return list
    .flatMap((automation) => liveRuns(automation, threads).map((run) => ({ automation, run })))
    .sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt))
    .slice(0, limit);
}

/** "42 s", "3 min", "1 h 05"; a running run counts up to now. Null when the end is not known. */
export function runDuration(run: AutomationRun, now: Date): string | null {
  const end = run.finishedAt ?? (run.status === "running" ? now.toISOString() : null);
  if (end === null) return null;
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(run.startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${two(minutes % 60)}`;
}

// A failed run stays in attention until the user opens it; a dispatch failure has no session, so a newer run clears it.
export function automationGroup(a: Automation, threads: Threads, seen: SeenState): AutomationGroup {
  const latest = liveRuns(a, threads)[0];
  if (latest?.status === "running") return "running";
  const thread = latest?.threadId ? threads.get(latest.threadId) : undefined;
  if (latest?.status === "waiting" || (latest?.status === "failed" && (!latest.threadId || (thread && isUnseen(thread, seen))))) return "attention";
  if (isFinishedReminder(a)) return "finished";
  return a.enabled ? "upcoming" : "paused";
}

const byNextRun = (a: Automation, b: Automation) => Number(a.nextRunAt === null) - Number(b.nextRunAt === null) || (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? "");
const byLastRunDesc = (a: Automation, b: Automation) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? "");
const byStartDesc = (a: Automation, b: Automation) => (b.runs[0]?.startedAt ?? "").localeCompare(a.runs[0]?.startedAt ?? "");

export function groupAutomations(list: Automation[], threads: Threads, seen: SeenState): Record<AutomationGroup, Automation[]> {
  const groups: Record<AutomationGroup, Automation[]> = { running: [], attention: [], upcoming: [], paused: [], finished: [] };
  for (const a of list) groups[automationGroup(a, threads, seen)].push(a);
  groups.running.sort(byStartDesc);
  groups.upcoming.sort(byNextRun);
  for (const id of ["attention", "paused", "finished"] as const) groups[id].sort(byLastRunDesc);
  return groups;
}

export function filterAutomations(list: Automation[], filter: { projectId: string | null; query: string }): Automation[] {
  const query = filter.query.trim().toLowerCase();
  return list.filter((a) => (filter.projectId === null || a.projectId === filter.projectId) && (query === "" || [a.title, a.project, a.scheduleLabel].some((text) => text.toLowerCase().includes(query))));
}

export function automationProjects(list: Automation[]): Array<{ id: string; title: string }> {
  const byId = new Map(list.map((a) => [a.projectId, a.project]));
  return [...byId].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
}

export function scheduleText(a: Automation): string {
  if (a.kind === "webhook") return "Webhook";
  if (a.kind !== "reminder") return a.scheduleLabel;
  const at = isFinishedReminder(a) ? a.lastRunAt : a.nextRunAt;
  return at ? reminderDate(at) : "";
}

/** The provider and the display name of a model; the raw id while T3 does not list the model. */
export function modelLabel(providers: DashboardProvider[], selection: ModelSelection | null): { instanceId: string; name: string } | null {
  if (!selection) return null;
  return { instanceId: selection.instanceId, name: findModel(providers, selection)?.model.name ?? selection.model };
}

// The URL holds a token: the UI copies it and never shows it.
export const copyableUrl = (a: Automation): string | null => (a.kind === "webhook" ? (a.webhook?.url ?? null) : null);

const two = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${d.getHours()}:${two(d.getMinutes())}`;

/** The latest run as a result: T3 marks a run "succeeded" once it is sent, so the thread gives the real state. */
export function lastResult(a: Automation, threads: Threads): LastRun | null {
  const run = liveRuns(a, threads)[0];
  if (!run) return null;
  if (run.status === "waiting" || run.status === "running") return { kind: run.status };
  if (run.status === "failed") return { kind: "failed", error: run.error };
  return run.status === "succeeded" ? { kind: "done", at: hm(new Date(run.finishedAt ?? run.startedAt)) } : null;
}

export function nextRunText(a: Automation, now: Date): string {
  if (isFinishedReminder(a)) return "—";
  if (!a.enabled) return "paused";
  return a.kind === "webhook" ? "On each delivery" : nextLabel(a.nextRunAt, now) || "—";
}

export function nextLabel(iso: string | null, now: Date): string {
  if (!iso) return "";
  const at = new Date(iso);
  const min = Math.floor((at.getTime() - now.getTime()) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `in ${min} min`;
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(at) - midnight(now)) / DAY_MS);
  if (days === 0) return `today ${hm(at)}`;
  if (days === 1) return `tomorrow ${hm(at)}`;
  if (days < 7) return `${DAYS[at.getDay()]} ${hm(at)}`;
  return reminderDate(iso);
}

export function reminderDate(iso: string): string {
  const at = new Date(iso);
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${hm(at)}`;
}
