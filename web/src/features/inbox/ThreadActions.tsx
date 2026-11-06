import type { RefObject } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { tabSelector } from "../../lib/tabs.ts";
import { useAction } from "../../lib/useAction.ts";
import { Icon, IconButton, fly } from "../../ui/index.ts";

export interface ThreadActionsProps {
  thread: DashboardThread;
  onDesk: boolean;
  t3EnvironmentId: string | null;
  onToggleDesk: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  /** The row that flies to the Desk entry when the agent is added. */
  rowRef: RefObject<HTMLElement | null>;
}

export function flyToDesk(row: Element | null, onDesk: boolean): void {
  if (!onDesk && row) fly(row, document.querySelector(tabSelector("desk")));
}

/** The buttons of a thread row: open in T3 Code, settle and add to the Desk. They show on hover and focus. */
export function ThreadActions({ thread: t, onDesk, t3EnvironmentId, onToggleDesk, onSettle, rowRef }: ThreadActionsProps) {
  const status = agentStatus(t);
  const { busy, error, run } = useAction("update the agent");
  // T3 refuses to settle a thread that runs or waits.
  const canSettle = status === "finished" || status === "idle";
  return (
    <div className="thread-actions">
      <OpenInT3 environmentId={t3EnvironmentId} threadId={t.id} className="inbox-open-t3 sm" />
      {canSettle && (
        <IconButton label="Settle" size="sm" variant={error ? "danger" : "secondary"} disabled={busy} tooltip={error ?? "Settle"} onClick={() => run(() => onSettle(t.id, true))}>
          <Icon name="archive" />
        </IconButton>
      )}
      <IconButton
        label="Open in Sessions"
        size="sm"
        className={`desk-toggle${onDesk ? " on" : ""}`}
        aria-pressed={onDesk}
        tooltip={onDesk ? "In Sessions (click to remove)" : "Open in Sessions"}
        onClick={() => {
          flyToDesk(rowRef.current, onDesk);
          onToggleDesk(t.id);
        }}
      >
        <Icon name={onDesk ? "check" : "plus"} />
      </IconButton>
    </div>
  );
}
