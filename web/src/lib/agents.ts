import type { DashboardThread } from "../../../shared/api.ts";
import { agentStatus } from "../../../shared/status.ts";

export interface AgentCounts {
  waiting: number;
  running: number;
}

/** Agents that wait for an answer and agents that work: the nav badges and the usage tile share it. */
export function agentCounts(threads: readonly DashboardThread[]): AgentCounts {
  const counts = { waiting: 0, running: 0 };
  for (const t of threads) {
    const status = agentStatus(t);
    if (status === "waiting") counts.waiting++;
    else if (status === "working") counts.running++;
  }
  return counts;
}
