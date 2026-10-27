import type { DashboardThread } from "../../../../shared/api.ts";
import { hasFailed, type AgentStatus } from "../../../../shared/status.ts";
import { pendingLabel } from "../../lib/threads.ts";
import { Badge } from "../../ui/index.ts";

/** The status of an agent as a badge: shared by the cards and the automation rows. */
export function StatusBadge({ thread, status }: { thread: DashboardThread; status: AgentStatus }) {
  if (status === "waiting") return <Badge variant="waiting">{thread.pending ? pendingLabel(thread.pending.category) : "Waiting"}</Badge>;
  if (status === "working") {
    return (
      <Badge variant="running">
        <span className="pulse" aria-hidden="true" />
        Running
      </Badge>
    );
  }
  if (status === "finished") {
    const failed = hasFailed(thread);
    return <Badge variant={failed ? "error" : "done"}>{failed ? "Error" : "Finished"}</Badge>;
  }
  return null;
}
