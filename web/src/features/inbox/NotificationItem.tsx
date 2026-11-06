import { memo, useRef } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Icon, IconButton, Pressable } from "../../ui/index.ts";
import { notificationDetail, notificationIcon, type NotificationKind } from "./inbox.ts";
import { flyToSessions } from "./ThreadActions.tsx";

interface Props {
  thread: DashboardThread;
  inSessions: boolean;
  onMarkRead: (id: string) => void;
  kind: NotificationKind;
  project: DashboardProject | undefined;
  // The model label, resolved by the parent so the row stays memoizable.
  modelName: string | null;
  now: Date;
  // addOnly: put the agent on the Sessions page without leaving the page.
  onOpen: (id: string, addOnly: boolean) => void;
}

function NotificationItemView({ thread: t, kind, project, modelName, now, inSessions, onOpen, onMarkRead }: Props) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const { icon, tone } = notificationIcon(t);
  const meta = [project?.title, relativeTime(t.lastActivityAt, now)].filter(Boolean).join(" · ");
  return (
    <div className={`notif-item ${kind}`}>
      <Pressable
        ref={rowRef}
        className="notif-row"
        onClick={(e) => {
          if (e.shiftKey) flyToSessions(rowRef.current, inSessions);
          onOpen(t.id, e.shiftKey);
        }}
      >
        <Icon name={icon} className={`icon notif-icon ${tone}`} />
        <span className="notif-body">
          <span className="notif-title">{threadTitle(t)}</span>
          <span className="notif-detail">{notificationDetail(t, modelName)}</span>
          <span className="notif-meta">{meta}</span>
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
