import type { DashboardThread } from "../../../../shared/api.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { hasFailed, threadState } from "../../../../shared/status.ts";
import { newestFirst } from "../../lib/threads.ts";
import type { IconName } from "../../ui/index.ts";

export interface ThreadSections {
  /** Waiting for an answer, or failed and not settled. */
  needsYou: DashboardThread[];
  /** Finished, not read yet. */
  unread: DashboardThread[];
  /** Finished and read. */
  readIdle: DashboardThread[];
  /** Pinned first, then the most recent; the other lists keep the input order. */
  running: DashboardThread[];
}

// Pinned first, like the T3 Code sidebar, then the most recent.
const byPinThenRecent = (a: DashboardThread, b: DashboardThread) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt);

// A thread that waits or runs is never hidden, even when settled, so it is never missed.
export function threadSections(threads: DashboardThread[], seen: SeenState): ThreadSections {
  const sections: ThreadSections = { needsYou: [], unread: [], readIdle: [], running: [] };
  for (const t of threads) {
    const state = threadState(t);
    if (state === "waiting") sections.needsYou.push(t);
    else if (state === "running") sections.running.push(t);
    else if (state === "error" && !t.settled) sections.needsYou.push(t);
    else if (isUnseen(t, seen)) sections.unread.push(t);
    else sections.readIdle.push(t);
  }
  const latest = new Set([...sections.needsYou, ...sections.unread, ...sections.readIdle]
    .sort(newestFirst).slice(0, 50).map((t) => t.id));
  sections.needsYou = sections.needsYou.filter((t) => latest.has(t.id));
  sections.unread = sections.unread.filter((t) => latest.has(t.id));
  sections.readIdle = sections.readIdle.filter((t) => latest.has(t.id));
  // Only Running shows this order: notificationList sorts the other lists itself.
  sections.running.sort(byPinThenRecent);
  return sections;
}

/** The bell, the sidebar and the Notifications header count the same: what needs you (read or not) and the unread results. */
export const attentionCount = (s: ThreadSections): number => s.needsYou.length + s.unread.length;

export type NotificationKind = "needs" | "unread" | "read";

export interface Notification {
  thread: DashboardThread;
  kind: NotificationKind;
}

/** All retained notifications, newest first regardless of read or settlement state. */
export function notificationList(s: ThreadSections): Notification[] {
  const group = (threads: DashboardThread[], kind: NotificationKind) => threads.map((thread) => ({ thread, kind }));
  return [...group(s.needsYou, "needs"), ...group(s.unread, "unread"), ...group(s.readIdle, "read")].sort((a, b) => newestFirst(a.thread, b.thread));
}

/** The status icon of a notification and its tone. */
export function notificationIcon(t: DashboardThread): { icon: IconName; tone: "warn" | "err" | "ok" | "info" } {
  if (t.pending) return { icon: "user", tone: "warn" };
  if (hasFailed(t)) return { icon: "alert", tone: "err" };
  return threadState(t) === "done" ? { icon: "circleCheck", tone: "ok" } : { icon: "info", tone: "info" };
}

/** The line under the title: what the agent waits for, the error, or "Finished". */
export function notificationDetail(t: DashboardThread): string {
  if (t.pending) return t.pending.category === "approval" ? "Waiting for your approval" : t.pending.category === "user-input" ? "Waiting for your answer" : "Waiting for you";
  if (hasFailed(t)) return t.lastError ?? "The run failed";
  return "Finished";
}
