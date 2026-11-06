import type { RefObject } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { tabSelector } from "../../lib/tabs.ts";
import { useAction } from "../../lib/useAction.ts";
import { Icon, IconButton, fly } from "../../ui/index.ts";

export interface ThreadActionsProps {
  thread: DashboardThread;
  inSessions: boolean;
  t3EnvironmentId: string | null;
  onToggleSessions: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  /** The row that flies to the Sessions entry when the agent is added. */
  rowRef: RefObject<HTMLElement | null>;
}

export function flyToSessions(row: Element | null, inSessions: boolean): void {
  if (!inSessions && row) fly(row, document.querySelector(tabSelector("sessions")));
}

/** The buttons of a thread row: open in T3 Code, settle and add to the Sessions page. They show on hover and focus. */
export function ThreadActions({ thread: t, inSessions, t3EnvironmentId, onToggleSessions, onSettle, rowRef }: ThreadActionsProps) {
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
        className={`sessions-toggle${inSessions ? " on" : ""}`}
        aria-pressed={inSessions}
        tooltip={inSessions ? "In Sessions (click to remove)" : "Open in Sessions"}
        onClick={() => {
          flyToSessions(rowRef.current, inSessions);
          onToggleSessions(t.id);
        }}
      >
        <Icon name={inSessions ? "check" : "plus"} />
      </IconButton>
    </div>
  );
}
