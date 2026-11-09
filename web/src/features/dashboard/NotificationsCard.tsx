import { useMemo, type ReactNode } from "react";
import { CardHead, Icon, IconButton } from "../../ui/index.ts";
import { SkeletonRows } from "./SkeletonRows.tsx";
import { attentionCount, notificationList, type Notification, type ThreadSections } from "./sections.ts";

interface Props {
  sections: ThreadSections;
  loading: boolean;
  renderItem: (n: Notification) => ReactNode;
  onMarkAllRead: () => void;
}

export function NotificationsCard({ sections, loading, renderItem, onMarkAllRead }: Props) {
  const items = useMemo(() => notificationList(sections), [sections]);
  const attention = attentionCount(sections);
  return (
    <section className="dashboard-card notifications-card" aria-labelledby="notifications-head">
      <CardHead
        id="notifications-head"
        icon="bell"
        title="Notifications"
        count={attention}
        actions={
          <IconButton label="Mark all read" tooltip="Mark all read" size="sm" variant="ghost" disabled={sections.unread.length === 0} onClick={onMarkAllRead}>
            <Icon name="checkCheck" />
          </IconButton>
        }
      />
      {loading ? (
        <SkeletonRows label="Loading notifications" rows={5} icon />
      ) : (
        <div className="notif-list">
          {attention === 0 && (
            <p className="card-empty">
              <strong>Nothing needs you</strong>
            </p>
          )}
          {items.map(renderItem)}
        </div>
      )}
    </section>
  );
}
