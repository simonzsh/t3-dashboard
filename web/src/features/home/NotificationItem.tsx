import { memo } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { threadTitle } from "../../lib/threads.ts";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { Icon, IconButton, Pressable } from "../../ui/index.ts";
import { notificationDetail, notificationIcon, type NotificationKind } from "./sections.ts";
import { openRow, threadAge } from "./threadRows.ts";

interface Props {
  thread: DashboardThread;
  inSessions: boolean;
  onMarkRead: (id: string) => void;
  kind: NotificationKind;
  project: DashboardProject | undefined;
  now: Date;
  // addOnly: put the agent on the Sessions page without leaving the page.
  onOpen: (id: string, addOnly: boolean) => void;
}

function NotificationItemView({ thread: t, kind, project, now, inSessions, onOpen, onMarkRead }: Props) {
  const { icon, tone } = notificationIcon(t);
  return (
    <div className={`notif-item ${kind}`}>
      <Pressable className="notif-row" onClick={(e) => openRow(e, t.id, inSessions, onOpen)}>
        <Icon name={icon} className={`icon notif-icon ${tone}`} />
        <span className="notif-body">
          <span className="title-line">
            <span className="notif-title">{threadTitle(t)}</span>
            <AutomationMark id={t.id} />
          </span>
          <span className="notif-status">
            <span className="notif-detail">{notificationDetail(t)}</span>
            <span className="notif-age">{threadAge(t, now)}</span>
            {project && <ProjectTag icon={project.icon} title={project.title} />}
          </span>
        </span>
        {kind !== "read" && <span className="notif-dot" aria-label="Unread" role="img" />}
      </Pressable>
      {/* Only an unread result can be marked read: a waiting or failed agent still needs you. */}
      {kind === "unread" && (
        <span className="thread-actions">
          <IconButton label="Mark as read" tooltip="Mark as read" size="sm" variant="ghost" onClick={() => onMarkRead(t.id)}>
            <Icon name="check" />
          </IconButton>
        </span>
      )}
    </div>
  );
}

export const NotificationItem = memo(NotificationItemView);
