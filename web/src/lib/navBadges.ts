import type { DashboardThread } from "../../../shared/api.ts";
import { agentStatus } from "../../../shared/status.ts";

/** A count in a nav badge: 9+ past nine. */
export const badgeText = (n: number): string => (n > 9 ? "9+" : String(n));

export interface NavBadges {
  sessionsRunning: number;
  sessionsWaiting: boolean;
}

/** Agents that wait for an answer and agents that work: the Dashboard card and the nav use the same rule. */
export function agentCounts(threads: readonly DashboardThread[]): { waiting: number; running: number } {
  const counts = { waiting: 0, running: 0 };
  for (const t of threads) {
    const status = agentStatus(t);
    if (status === "waiting") counts.waiting++;
    else if (status === "working") counts.running++;
  }
  return counts;
}

/** Every listed agent counts, open as a column or not, like the sessions list. */
export function navBadges(threads: readonly DashboardThread[]): NavBadges {
  const counts = agentCounts(threads);
  return { sessionsRunning: counts.running, sessionsWaiting: counts.waiting > 0 };
}
