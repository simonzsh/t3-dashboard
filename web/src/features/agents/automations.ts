import type { Automation, DashboardThread } from "../../../../shared/api.ts";
import { ACTIVE_STATUSES, hasFailed } from "../../../../shared/status.ts";

export type LastRun = { kind: "waiting" } | { kind: "running" } | { kind: "failed"; error: string | null } | { kind: "done"; at: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

// Dedicated threads and run threads of scheduled tasks live in the automations column only.
export function excludeRoutineThreads(threads: DashboardThread[], hiddenThreadIds: readonly string[]): DashboardThread[] {
  if (hiddenThreadIds.length === 0) return threads;
  const hidden = new Set(hiddenThreadIds);
  return threads.filter((t) => !hidden.has(t.id));
}

// A setup thread shows as a row only while the agent works or waits; idle with no task, it returns to the grid.
export function setupThreads(threads: DashboardThread[], setupThreadIds: readonly string[]): DashboardThread[] {
  const byId = new Map(threads.map((t) => [t.id, t]));
  return setupThreadIds.flatMap((id) => {
    const t = byId.get(id);
    return t && (ACTIVE_STATUSES.has(t.status) || t.pending) ? [t] : [];
  });
}

const byNextRun = (a: Automation, b: Automation) => Number(a.nextRunAt === null) - Number(b.nextRunAt === null) || (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? "");

export function splitAutomations(list: Automation[]): { routines: Automation[]; reminders: Automation[] } {
  return {
    routines: list.filter((a) => a.kind === "routine").sort(byNextRun),
    reminders: list.filter((a) => a.kind === "reminder").sort(byNextRun),
  };
}

const two = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${d.getHours()}:${two(d.getMinutes())}`;

// T3 marks a run "succeeded" once it is sent, not when the agent ends: the thread gives the real state.
export function lastRunState(a: Automation, thread?: DashboardThread): LastRun | null {
  if (thread?.pending) return { kind: "waiting" };
  if (a.lastRunStatus === "failed") return { kind: "failed", error: a.lastRunError };
  if (a.lastRunStatus === "running" || (thread && ACTIVE_STATUSES.has(thread.status))) return { kind: "running" };
  if (thread && hasFailed(thread)) return { kind: "failed", error: thread.lastError };
  if (a.lastRunStatus === "succeeded" && a.lastRunAt) {
    const at = new Date(a.lastRunAt);
    return { kind: "done", at: `${two(at.getHours())}:${two(at.getMinutes())}` };
  }
  return null;
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
