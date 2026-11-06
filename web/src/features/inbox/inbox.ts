import type { DashboardThread } from "../../../../shared/api.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { hasFailed, threadState } from "../../../../shared/status.ts";
import type { IconName } from "../../ui/index.ts";
import { excludeRoutineThreads } from "../automations/automations.ts";

/** Read threads older than this fold behind "See all", and "Settle all" settles them. */
export const RECENT_SETTLED_MS = 3 * 24 * 3_600_000;

export interface InboxSections {
  /** Waiting for an answer, or failed and not settled. */
  needsYou: DashboardThread[];
  /** Finished, not settled, not read yet. */
  unread: DashboardThread[];
  /** Finished, not settled, read. */
  readIdle: DashboardThread[];
  running: DashboardThread[];
}

// Pinned first, like the T3 Code sidebar, then the most recent.
const byPinThenRecent = (a: DashboardThread, b: DashboardThread) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt);

// A thread that waits or runs is never hidden, even when settled, so it is never missed.
// `relaunch`: threads shown under "To relaunch", so not listed again as read and idle.
export function inboxSections(threads: DashboardThread[], seen: SeenState, now: Date, relaunch: ReadonlySet<string> = new Set()): InboxSections {
  const sections: InboxSections = { needsYou: [], unread: [], readIdle: [], running: [] };
  for (const t of threads) {
    const state = threadState(t);
    if (state === "waiting") sections.needsYou.push(t);
    else if (state === "running") sections.running.push(t);
    else if (t.settled) continue;
    else if (state === "error") sections.needsYou.push(t);
    else if (isUnseen(t, seen)) sections.unread.push(t);
    else if (!relaunch.has(t.id)) sections.readIdle.push(t);
  }
  for (const list of Object.values(sections)) list.sort(byPinThenRecent);
  return sections;
}

/** The threads the Inbox lists: routine runs and setup threads have their own place. */
export const inboxThreads = (threads: DashboardThread[], hiddenIds: readonly string[] = [], setupIds: readonly string[] = []): DashboardThread[] =>
  excludeRoutineThreads(threads, [...hiddenIds, ...setupIds]);

/** The threads "Settle all older than 3 days" settles. */
export const settleCandidates = (readIdle: DashboardThread[], now: Date): DashboardThread[] => {
  const before = new Date(now.getTime() - RECENT_SETTLED_MS).toISOString();
  return readIdle.filter((t) => t.lastActivityAt < before);
};

/** The Inbox tab badge: what needs you or has an unread result, and was not read yet. */
export const unreadCount = (s: InboxSections, seen: SeenState): number => [...s.needsYou, ...s.unread].filter((t) => isUnseen(t, seen)).length;

export type NotificationKind = "needs" | "unread" | "read";

export interface Notification {
  thread: DashboardThread;
  kind: NotificationKind;
}

const newestFirst = (a: DashboardThread, b: DashboardThread) => b.lastActivityAt.localeCompare(a.lastActivityAt);

/** Read threads that stay in the list without "See all". */
export const recentRead = (readIdle: DashboardThread[], now: Date): DashboardThread[] => {
  const since = new Date(now.getTime() - RECENT_SETTLED_MS).toISOString();
  return readIdle.filter((t) => t.lastActivityAt >= since);
};

/** What needs you first, then unread results, then read threads; newest first in each group. */
export function notificationList(s: InboxSections, now: Date, all: boolean): Notification[] {
  const group = (threads: DashboardThread[], kind: NotificationKind) => [...threads].sort(newestFirst).map((thread) => ({ thread, kind }));
  return [...group(s.needsYou, "needs"), ...group(s.unread, "unread"), ...group(all ? s.readIdle : recentRead(s.readIdle, now), "read")];
}

/** The status icon of a notification and its tone. */
export function notificationIcon(t: DashboardThread): { icon: IconName; tone: "warn" | "err" | "ok" | "info" } {
  if (t.pending) return { icon: "alertTriangle", tone: "warn" };
  if (hasFailed(t)) return { icon: "alert", tone: "err" };
  return threadState(t) === "done" ? { icon: "circleCheck", tone: "ok" } : { icon: "info", tone: "info" };
}

/** The line under the title: what the agent waits for, the error, or the model of a finished run. */
export function notificationDetail(t: DashboardThread, modelName: string | null): string {
  if (t.pending) return t.pending.category === "approval" ? "Waiting for your approval" : t.pending.category === "user-input" ? "Waiting for your answer" : "Waiting for you";
  if (hasFailed(t)) return t.lastError ?? "The run failed";
  return modelName ? `Finished · ${modelName}` : "Finished";
}
