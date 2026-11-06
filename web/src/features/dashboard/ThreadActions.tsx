import type { MouseEvent, RefObject } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { relativeTime } from "../../lib/format.ts";
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

/** A click on a row opens its thread; with Shift the agent only joins Sessions and the row flies there. */
export function openRow(e: MouseEvent<HTMLElement>, id: string, inSessions: boolean, onOpen: (id: string, addOnly: boolean) => void): void {
  if (e.shiftKey) flyToSessions(e.currentTarget, inSessions);
  onOpen(id, e.shiftKey);
}

/** The project and the age of a thread. */
export const threadMeta = (t: DashboardThread, project: DashboardProject | undefined, now: Date): string => [project?.title, relativeTime(t.lastActivityAt, now)].filter(Boolean).join(" · ");

/** The buttons of a thread row: open in T3 Code, settle and add to the Sessions page. They show on hover and focus. */
export function ThreadActions({ thread: t, inSessions, t3EnvironmentId, onToggleSessions, onSettle, rowRef }: ThreadActionsProps) {
  const status = agentStatus(t);
  const { busy, error, run } = useAction("update the agent");
  // T3 refuses to settle a thread that runs or waits.
  const canSettle = status === "finished" || status === "idle";
  return (
    <div className="thread-actions">
      <OpenInT3 environmentId={t3EnvironmentId} threadId={t.id} className="thread-open-t3 sm" />
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
