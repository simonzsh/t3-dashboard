import type { AutomationRun } from "../../../../shared/api.ts";
import { RunningBadge } from "../../lib/StatusBadge.tsx";
import { Badge } from "../../ui/index.ts";

/** The status of a run as a badge; a failed run carries its error as a tooltip. */
export function RunBadge({ run }: { run: Pick<AutomationRun, "status" | "error"> }) {
  switch (run.status) {
    case "running":
      return <RunningBadge />;
    case "waiting":
      return <Badge variant="waiting">Waiting</Badge>;
    case "failed":
      return (
        <span data-tooltip={run.error ?? "The run failed"}>
          <Badge variant="error">Error</Badge>
        </span>
      );
    case "succeeded":
      return <Badge variant="done">Done</Badge>;
    default:
      return <Badge variant="neutral">Unknown</Badge>;
  }
}
