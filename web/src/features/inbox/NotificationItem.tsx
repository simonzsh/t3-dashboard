import { memo, useRef } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Icon, Pressable } from "../../ui/index.ts";
import { notificationDetail, notificationIcon, type NotificationKind } from "./inbox.ts";
import { ThreadActions, flyToDesk, type ThreadActionsProps } from "./ThreadActions.tsx";

interface Props extends Omit<ThreadActionsProps, "thread" | "rowRef"> {
  thread: DashboardThread;
  kind: NotificationKind;
  project: DashboardProject | undefined;
  // The model label, resolved by the parent so the row stays memoizable.
  modelName: string | null;
  now: Date;
  // addOnly: put the agent on the Desk without leaving the page.
  onOpen: (id: string, addOnly: boolean) => void;
}

function NotificationItemView({ thread: t, kind, project, modelName, now, onOpen, ...actions }: Props) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const { icon, tone } = notificationIcon(t);
  const meta = [project?.title, relativeTime(t.lastActivityAt, now)].filter(Boolean).join(" · ");
  return (
    <div className={`notif-item ${kind}`}>
      <Pressable
        ref={rowRef}
        className="notif-row"
        onClick={(e) => {
          if (e.shiftKey) flyToDesk(rowRef.current, actions.onDesk);
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
      <ThreadActions thread={t} rowRef={rowRef} {...actions} />
    </div>
  );
}

export const NotificationItem = memo(NotificationItemView);
