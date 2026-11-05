import type { DashboardThread } from "../../../../shared/api.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { threadState } from "../../../../shared/status.ts";
import { excludeRoutineThreads } from "../automations/automations.ts";

/** Rows each Inbox list shows before "Show N more". */
export const SECTION_LIMIT = 10;

/** Older settled threads are hidden: there are hundreds of them. */
export const RECENT_SETTLED_MS = 3 * 24 * 3_600_000;

export interface InboxSections {
  /** Waiting for an answer, or failed and not settled. */
  needsYou: DashboardThread[];
  /** Finished, not settled, not read yet. */
  unread: DashboardThread[];
  /** Finished, not settled, read. */
  readIdle: DashboardThread[];
  running: DashboardThread[];
  settled: DashboardThread[];
}

// Pinned first, like the T3 Code sidebar, then the most recent.
const byPinThenRecent = (a: DashboardThread, b: DashboardThread) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt);

// A thread that waits or runs is never hidden, even when settled, so it is never missed.
// `relaunch`: threads shown under "To relaunch", so not listed again as read and idle.
export function inboxSections(threads: DashboardThread[], seen: SeenState, now: Date, relaunch: ReadonlySet<string> = new Set()): InboxSections {
  const sections: InboxSections = { needsYou: [], unread: [], readIdle: [], running: [], settled: [] };
  const since = new Date(now.getTime() - RECENT_SETTLED_MS).toISOString();
  for (const t of threads) {
    const state = threadState(t);
    if (state === "waiting") sections.needsYou.push(t);
    else if (state === "running") sections.running.push(t);
    else if (t.settled) {
      if (t.lastActivityAt >= since) sections.settled.push(t);
    } else if (state === "error") sections.needsYou.push(t);
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

export function inboxSummary(needsYou: number, unread: number, relaunch: number): string {
  const parts = [
    needsYou > 0 && `${needsYou} ${needsYou === 1 ? "needs" : "need"} you`,
    unread > 0 && `${unread} unread`,
    relaunch > 0 && `${relaunch} to relaunch`,
  ];
  return parts.filter(Boolean).join(" · ");
}

export const nothingToDo = (s: InboxSections, relaunch: number, upNext: number): boolean => s.needsYou.length + s.unread.length + relaunch + upNext === 0;
