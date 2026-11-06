import type { Automation, DashboardProvider, DashboardThread, ModelSelection } from "../../../../shared/api.ts";
import { ACTIVE_STATUSES, hasFailed } from "../../../../shared/status.ts";
import { MONTHS } from "../../lib/format.ts";
import { findModel } from "../conversation/composer.ts";

export type LastRun = { kind: "waiting" } | { kind: "running" } | { kind: "failed"; error: string | null } | { kind: "done"; at: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

// Dedicated threads and run threads of scheduled tasks live in the Automations tab only.
export function excludeRoutineThreads(threads: DashboardThread[], hiddenThreadIds: readonly string[]): DashboardThread[] {
  if (hiddenThreadIds.length === 0) return threads;
  const hidden = new Set(hiddenThreadIds);
  // A run that waits for an answer needs the user: it stays in the Dashboard lists.
  return threads.filter((t) => !hidden.has(t.id) || t.pending !== null);
}

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

export type AutomationGroup = "attention" | "today" | "upcoming" | "inactive";

// Needs attention beats paused: a failed run stays visible until the user looks at it.
export function automationGroup(a: Automation, thread: DashboardThread | undefined, now: Date): AutomationGroup {
  const last = lastRunState(a, thread);
  if (last?.kind === "failed" || last?.kind === "waiting") return "attention";
  if (!a.enabled) return "inactive";
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  if (last?.kind === "running" || (a.nextRunAt !== null && new Date(a.nextRunAt).getTime() < endOfToday)) return "today";
  return "upcoming";
}

const byNextRun = (a: Automation, b: Automation) => Number(a.nextRunAt === null) - Number(b.nextRunAt === null) || (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? "");
const byLastRunDesc = (a: Automation, b: Automation) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? "");

export function groupAutomations(list: Automation[], threads: Map<string, DashboardThread>, now: Date): Record<AutomationGroup, Automation[]> {
  const groups: Record<AutomationGroup, Automation[]> = { attention: [], today: [], upcoming: [], inactive: [] };
  for (const a of list) groups[automationGroup(a, a.threadId ? threads.get(a.threadId) : undefined, now)].push(a);
  groups.attention.sort(byLastRunDesc);
  groups.inactive.sort(byLastRunDesc);
  groups.today.sort(byNextRun);
  groups.upcoming.sort(byNextRun);
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
