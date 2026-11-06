import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { DashboardThread } from "../../../../shared/api.ts";
import { useAction } from "../../lib/useAction.ts";
import { Button, CardHead, Icon, IconButton, useEscape } from "../../ui/index.ts";
import { SkeletonRows } from "./SkeletonRows.tsx";
import { notificationList, type Notification, type ThreadSections } from "./sections.ts";

interface Props {
  sections: ThreadSections;
  /** Read threads from the last 3 days, and the older ones that wait behind "See all". */
  recent: DashboardThread[];
  old: DashboardThread[];
  loading: boolean;
  renderItem: (n: Notification) => ReactNode;
  onMarkAllRead: () => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  /** Phone only: the card fills the screen, so it gets a Close button and answers Escape. */
  onClose?: () => void;
}

// Settles every thread even when some fail, then reports how many failed.
async function settleEach(threads: DashboardThread[], onSettle: Props["onSettle"]): Promise<void> {
  const results = await Promise.allSettled(threads.map((t) => onSettle(t.id, true)));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) throw new Error(`${failed} of ${threads.length} failed.`);
}

export function NotificationsCard({ sections, recent, old, loading, renderItem, onMarkAllRead, onSettle, onClose }: Props) {
  useEscape(useCallback(() => onClose?.(), [onClose]));
  const [all, setAll] = useState(false);
  const settleAll = useAction("settle the threads");
  const items = useMemo(() => notificationList(sections, all ? sections.readIdle : recent), [sections, all, recent]);
  const attention = sections.needsYou.length + sections.unread.length;
  return (
    <section className="dashboard-card notifications-card" aria-labelledby="notifications-head">
      <CardHead
        id="notifications-head"
        icon="bell"
        title="Notifications"
        count={attention}
        actions={
          <>
            <IconButton label="Mark all read" tooltip="Mark all read" size="sm" variant="ghost" disabled={sections.unread.length === 0} onClick={onMarkAllRead}>
              <Icon name="checkCheck" />
            </IconButton>
            {onClose && (
              <IconButton label="Close notifications" tooltip="Close" size="sm" variant="ghost" autoFocus onClick={onClose}>
                <Icon name="x" />
              </IconButton>
            )}
          </>
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
      {(old.length > 0 || all) && (
        <div className="notif-foot">
          {all && old.length > 0 && (
            <Button
              size="sm"
              loading={settleAll.busy}
              tooltip={settleAll.error ?? undefined}
              variant={settleAll.error ? "danger" : "secondary"}
              onClick={() => void settleAll.run(() => settleEach(old, onSettle))}
            >
              Settle all older than 3 days ({old.length})
            </Button>
          )}
          <Button variant="ghost" size="sm" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? "Show less" : `See all (${old.length} more)`}
          </Button>
        </div>
      )}
    </section>
  );
}
