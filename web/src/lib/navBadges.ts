import type { DashboardThread } from "../../../shared/api.ts";
import { agentStatus } from "../../../shared/status.ts";

export interface NavBadges {
  homeUnread: number;
  deskRunning: number;
  deskWaiting: boolean;
}

/** Agents that wait for an answer and agents that work: the Home card and the nav use the same rule. */
export function agentCounts(threads: readonly DashboardThread[]): { waiting: number; running: number } {
  const counts = { waiting: 0, running: 0 };
  for (const t of threads) {
    const status = agentStatus(t);
    if (status === "waiting") counts.waiting++;
    else if (status === "working") counts.running++;
  }
  return counts;
}

export function navBadges(threads: readonly DashboardThread[], deskIds: ReadonlySet<string>, unread: number): NavBadges {
  const counts = agentCounts(threads.filter((t) => deskIds.has(t.id)));
  return { homeUnread: unread, deskRunning: counts.running, deskWaiting: counts.waiting > 0 };
}
