import type { DashboardProvider, ThreadDetail } from "../../../../shared/api.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { Button, Icon } from "../../ui/index.ts";
import { findModel } from "./composer.ts";
import { chipLabel } from "./modelPanel.ts";
import { useTicker } from "./Steps.tsx";
import { subagentStatus } from "./subagentBar.ts";

/** In place of the composer on a subagent thread, like T3 Code: the subagent runs on its own. */
export function SubagentBar({ detail, providers, onOpenThread }: { detail: ThreadDetail; providers: DashboardProvider[]; onOpenThread?: (id: string) => void }) {
  const selection = detail.modelSelection;
  const label = chipLabel(selection, findModel(providers, selection));
  const now = useTicker(Boolean(detail.activity && !detail.activity.completedAt));
  const status = subagentStatus(detail.activity, now);
  const parent = detail.parentThreadId;
  return (
    <div className="composer">
      <div className="subagent-bar">
      {selection && <ProviderIcon provider={selection.instanceId} />}
      <span className="subagent-bar-model">{label.name}</span>
      {label.effort && <span className="subagent-bar-muted subagent-bar-effort">{label.effort}</span>}
      {status && <span className="subagent-bar-muted subagent-bar-status">{status}</span>}
      <span className="subagent-bar-muted subagent-bar-own">Runs on its own</span>
      {parent && onOpenThread && (
        <Button size="sm" variant="ghost" onClick={() => onOpenThread(parent)}>
          <Icon name="arrowUpLeft" /> Open parent
        </Button>
      )}
      </div>
    </div>
  );
}
