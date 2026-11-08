import type { Automation, AutomationRun, AutomationRunOutcome, DashboardProvider, DashboardThread, ModelSelection } from "../../../../shared/api.ts";
import { RUN_OUTCOMES } from "../../../../shared/automations.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { ACTIVE_STATUSES, threadState } from "../../../../shared/status.ts";
import { MONTHS, relativeTime } from "../../lib/format.ts";
import { findModel } from "../conversation/composer.ts";

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

type Threads = ReadonlyMap<string, DashboardThread>;

/** The run with its thread laid over it; an idle thread says nothing, so the stored status stays. */
export function liveRun(run: AutomationRun, thread: DashboardThread | undefined): AutomationRun {
  const status = thread && RUN_OUTCOMES[threadState(thread)];
  if (!thread || !status) return run;
  // T3 marks a timed-out or interrupted run failed while its thread reads done: keep the failure.
  if (run.status === "failed" && status === "succeeded") return run;
  const terminal = status === "succeeded" || status === "failed";
  return { ...run, status, error: status === "failed" ? (thread.lastError ?? run.error) : run.error, finishedAt: terminal ? (run.finishedAt ?? thread.lastActivityAt) : run.finishedAt };
}

/** A bound task runs in one thread: only its newest run follows that thread. */
export function liveRuns(a: Automation, threads: Threads): AutomationRun[] {
  return a.runs.map((run, i) => (a.bound && i > 0 ? run : liveRun(run, run.threadId ? threads.get(run.threadId) : undefined)));
}

/** A bound task runs in one chat: only its newest run can be unread. */
export function runUnread(a: Automation, run: AutomationRun, threads: Threads, seen: SeenState): boolean {
  const thread = run.threadId ? threads.get(run.threadId) : undefined;
  if (!thread || (a.bound && run.startedAt !== a.runs[0]?.startedAt)) return false;
  return isUnseen(thread, seen);
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

/** "42 s", "3 min", "1 h 05"; a running run counts up to now. Null when the end is not known. */
export function runDuration(run: AutomationRun, now: Date): string | null {
  const end = run.finishedAt ?? (run.status === "running" ? now.toISOString() : null);
  if (end === null) return null;
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(run.startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${two(minutes % 60)}`;
}

export type AutomationFilter = "all" | "unread" | "failed" | "running" | "paused";
export type AutomationSort = "recent" | "next" | "project";

/** Failed: the latest run failed, a dispatch failure included. Paused: disabled, so a finished reminder too. */
export function matchesFilter(a: Automation, filter: AutomationFilter, threads: Threads, seen: SeenState): boolean {
  if (filter === "unread") return latestUnread(a, threads, seen);
  if (filter === "failed") return liveRuns(a, threads)[0]?.status === "failed";
  if (filter === "running") return isRunning(a, threads);
  return filter === "paused" ? !a.enabled : true;
}

const byName = (a: Automation, b: Automation) => a.title.localeCompare(b.title);
// A disabled task has no next run to compare: it goes last, like a webhook.
const nextAt = (a: Automation) => (a.enabled ? a.nextRunAt : null);
const byNextRun = (a: Automation, b: Automation) => Number(nextAt(a) === null) - Number(nextAt(b) === null) || (nextAt(a) ?? "").localeCompare(nextAt(b) ?? "") || byName(a, b);
const byRecent = (a: Automation, b: Automation) => Number(!a.runs[0]) - Number(!b.runs[0]) || (b.runs[0]?.startedAt ?? "").localeCompare(a.runs[0]?.startedAt ?? "") || byName(a, b);

/** "project" sorts like "recent": the view then groups the rows under their project. */
export function sortAutomations(list: Automation[], sort: AutomationSort): Automation[] {
  return [...list].sort(sort === "next" ? byNextRun : byRecent);
}

export function filterAutomations(list: Automation[], query: string): Automation[] {
  const text = query.trim().toLowerCase();
  return list.filter((a) => text === "" || [a.title, a.project, a.scheduleLabel].some((field) => field.toLowerCase().includes(text)));
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

export const RUN_LABELS: Record<AutomationRunOutcome, string> = { succeeded: "Succeeded", failed: "Failed", running: "Running", waiting: "Waiting for you", unknown: "Unknown" };

/** "2 h ago · 3 min": when a run started and how long it took. A bound chat goes on after the run: no duration. */
export function runWhen(run: AutomationRun, now: Date, bound = false): string {
  return [relativeTime(run.startedAt, now), bound ? null : runDuration(run, now)].filter(Boolean).join(" · ");
}

/** The latest run in words, read through its thread: T3 marks a run "succeeded" once it is sent. */
export function lastRunLine(a: Automation, threads: Threads, now: Date): { status: AutomationRunOutcome | null; label: string; detail: string } {
  const run = liveRuns(a, threads)[0];
  if (!run) return { status: null, label: "Never run", detail: "" };
  return { status: run.status, label: RUN_LABELS[run.status], detail: runWhen(run, now, a.bound) };
}

export const isRunning = (a: Automation, threads: Threads): boolean => liveRuns(a, threads)[0]?.status === "running";

/** A dot beside the task: its latest finished run is still unread. */
export function latestUnread(a: Automation, threads: Threads, seen: SeenState): boolean {
  const run = latestFinished(a, threads);
  return run !== null && runUnread(a, run, threads, seen);
}

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// The words for a task with no next date: "" for a finished reminder. Null when the next run has a date.
function noNextRun(a: Automation): string | null {
  if (isFinishedReminder(a)) return "";
  if (!a.enabled) return "Paused";
  return a.kind === "webhook" ? "On each delivery" : null;
}

/** The next run for the sheet: a day and a time. */
export const nextRunText = (a: Automation, now: Date): string => (noNextRun(a) ?? nextLabel(a.nextRunAt, now)) || "—";

/** "Next in 3 h" for the row; the sheet shows a date. Nothing for a finished reminder or a task with no next run. */
export function nextRunLine(a: Automation, now: Date): string {
  const words = noNextRun(a);
  if (words !== null) return words;
  if (!a.nextRunAt) return "";
  const min = Math.floor((new Date(a.nextRunAt).getTime() - now.getTime()) / 60_000);
  if (min < 1) return "Next now";
  if (min < 60) return `Next in ${min} min`;
  return min < 1440 ? `Next in ${Math.floor(min / 60)} h` : `Next in ${Math.floor(min / 1440)} d`;
}

function nextLabel(iso: string | null, now: Date): string {
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

export const automationsPollMs = (onPage: boolean): number => (onPage ? 30_000 : 120_000);
