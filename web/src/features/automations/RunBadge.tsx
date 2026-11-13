import type { AutomationRunOutcome } from "../../../../shared/api.ts";
import { RunningBadge } from "../../lib/StatusBadge.tsx";
import { Badge, type BadgeVariant } from "../../ui/index.ts";
import { RUN_LABELS } from "./automations.ts";

const VARIANTS: Record<Exclude<AutomationRunOutcome, "running">, BadgeVariant> = { succeeded: "done", failed: "error", waiting: "waiting", unknown: "neutral" };

/** The outcome of a run as the status pill of the Home rows. */
export function RunBadge({ status }: { status: AutomationRunOutcome }) {
  return status === "running" ? <RunningBadge /> : <Badge variant={VARIANTS[status]}>{RUN_LABELS[status]}</Badge>;
}
