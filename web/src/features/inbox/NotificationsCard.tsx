import { useState, type ReactNode } from "react";
import { Button, Icon, IconButton, Loader } from "../../ui/index.ts";
import { CardHead } from "./CardHead.tsx";
import { notificationList, recentRead, type InboxSections, type Notification } from "./inbox.ts";

interface Props {
  sections: InboxSections;
  now: Date;
  loading: boolean;
  renderItem: (n: Notification) => ReactNode;
  onMarkAllRead: () => void;
  /** "Settle all older than 3 days": shown when the list is expanded. */
  settleAll: ReactNode;
}

export function NotificationsCard({ sections, now, loading, renderItem, onMarkAllRead, settleAll }: Props) {
  const [all, setAll] = useState(false);
  const items = notificationList(sections, now, all);
  const attention = sections.needsYou.length + sections.unread.length;
  const folded = sections.readIdle.length - recentRead(sections.readIdle, now).length;
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
        <Loader />
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
      {(folded > 0 || all) && (
        <div className="notif-foot">
          {all && settleAll}
          <Button variant="ghost" size="sm" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? "Show less" : `See all (${folded} more)`}
          </Button>
        </div>
      )}
    </section>
  );
}
