import type { RunActivity } from "../../../../shared/api.ts";
import { duration } from "../../lib/format.ts";

/** "Completed in 1m 54s" or "Running for 12s", like T3 Code under a subagent thread. */
export function subagentStatus(activity: RunActivity | null, now: number): string | null {
  const start = Date.parse(activity?.startedAt ?? "");
  if (!activity || !Number.isFinite(start)) return null;
  const end = Date.parse(activity.completedAt ?? "");
  return Number.isFinite(end) ? `Completed in ${duration(end - start)}` : `Running for ${duration(now - start)}`;
}
