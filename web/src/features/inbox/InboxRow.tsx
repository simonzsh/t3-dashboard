import { memo, useRef } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { relativeTime } from "../../lib/format.ts";
import { tabSelector } from "../../lib/tabs.ts";
import { threadTitle } from "../../lib/threads.ts";
import { OpenInT3 } from "../../lib/OpenInT3.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { StatusBadge } from "../../lib/StatusBadge.tsx";
import { useAction } from "../../lib/useAction.ts";
import { Button, Icon, IconButton, Pressable, fly } from "../../ui/index.ts";

export type RowActions = "open" | "open-settle" | "desk-settle" | "desk" | "unsettle";

interface Props {
  thread: DashboardThread;
  project: DashboardProject | undefined;
  now: Date;
  actions: RowActions;
  onDesk: boolean;
  t3EnvironmentId: string | null;
  // addOnly: put the agent on the Desk without leaving the current tab.
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
}

function InboxRowView({ thread: t, project, now, actions, onDesk, t3EnvironmentId, onOpen, onToggleDesk, onSettle }: Props) {
  const status = agentStatus(t);
  const { busy, error, run } = useAction("update the agent");
  const rowRef = useRef<HTMLButtonElement>(null);
  const flyToDesk = () => {
    if (!onDesk && rowRef.current) fly(rowRef.current, document.querySelector(tabSelector("desk")));
  };
  // Settling flies to the "Recently settled" line, unsettling back to the Finished heading.
  const flyToSettle = () => {
    if (rowRef.current) fly(rowRef.current, document.querySelector(t.settled ? ".inbox-finished-head" : ".inbox-settled-head"));
  };
  const showOpen = actions === "open" || actions === "open-settle";
  const showDesk = actions === "desk" || actions === "desk-settle";
  const settle = actions === "open-settle" || actions === "desk-settle" || actions === "unsettle";
  return (
    <div className="inbox-item">
      <Pressable
        ref={rowRef}
        className={`inbox-row ${status}${onDesk ? " on-desk" : ""}${t.settled && status !== "working" ? " is-settled" : ""}`}
        onClick={(e) => {
          if (e.shiftKey) flyToDesk();
          onOpen(t.id, e.shiftKey);
        }}
      >
        <ProviderIcon provider={t.provider} />
        <span className="inbox-title">{threadTitle(t)}</span>
        {project && (
          <span className="project-tag">
            <ProjectIcon icon={project.icon} />
            <span className="project-tag-text">{project.title}</span>
          </span>
        )}
        <span data-tooltip={status === "finished" ? (t.lastError ?? undefined) : undefined}>
          <StatusBadge thread={t} status={status} />
        </span>
        {t.pinned && <Icon name="pin" label="Pinned" className="inbox-pin" />}
        <span className="inbox-time">{relativeTime(t.lastActivityAt, now)}</span>
      </Pressable>
      <div className="inbox-actions">
        <OpenInT3 environmentId={t3EnvironmentId} threadId={t.id} className="inbox-open-t3 sm" />
        {showOpen && (
          <Button size="sm" onClick={() => onOpen(t.id, false)}>
            Open on Desk
          </Button>
        )}
        {settle && (
          <IconButton
            label={t.settled ? "Unsettle" : "Settle"}
            size="sm"
            variant={error ? "danger" : "secondary"}
            disabled={busy}
            tooltip={error ?? (t.settled ? "Unsettle" : "Settle")}
            onClick={() => {
              flyToSettle();
              run(() => onSettle(t.id, !t.settled));
            }}
          >
            <Icon name={t.settled ? "unarchive" : "archive"} />
          </IconButton>
        )}
        {showDesk && (
          <IconButton
            label="Add to Desk"
            size="sm"
            className={`desk-toggle${onDesk ? " on" : ""}`}
            aria-pressed={onDesk}
            tooltip={onDesk ? "On Desk (click to remove)" : "Add to Desk"}
            onClick={() => {
              flyToDesk();
              onToggleDesk(t.id);
            }}
          >
            <Icon name={onDesk ? "check" : "plus"} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

export const InboxRow = memo(InboxRowView);
