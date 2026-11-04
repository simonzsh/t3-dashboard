import type { DashboardThread } from "../../../../shared/api.ts";
import { threadState } from "../../../../shared/status.ts";

/** Older settled threads are hidden: there are hundreds of them. */
export const RECENT_SETTLED_MS = 3 * 24 * 3_600_000;

export interface InboxSections {
  waiting: DashboardThread[];
  errors: DashboardThread[];
  finished: DashboardThread[];
  running: DashboardThread[];
  settled: DashboardThread[];
}

// Pinned first, like the T3 Code sidebar, then the most recent.
const byPinThenRecent = (a: DashboardThread, b: DashboardThread) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt);

// A thread that waits or runs is never hidden, even when settled, so it is never missed.
export function inboxSections(threads: DashboardThread[], now: Date): InboxSections {
  const sections: InboxSections = { waiting: [], errors: [], finished: [], running: [], settled: [] };
  const since = new Date(now.getTime() - RECENT_SETTLED_MS).toISOString();
  for (const t of threads) {
    const state = threadState(t);
    if (state === "waiting") sections.waiting.push(t);
    else if (state === "running") sections.running.push(t);
    else if (t.settled) {
      if (t.lastActivityAt >= since) sections.settled.push(t);
    } else if (state === "error") sections.errors.push(t);
    else sections.finished.push(t);
  }
  for (const list of Object.values(sections)) list.sort(byPinThenRecent);
  return sections;
}

export const nothingToDo = (s: InboxSections, tickets: number): boolean => s.waiting.length + s.errors.length + s.finished.length + tickets === 0;
