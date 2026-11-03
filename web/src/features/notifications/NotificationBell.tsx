import { useLayoutEffect, useRef, useState } from "react";
import { relativeTime } from "../../lib/format.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Badge, enter, Icon, IconButton, Popover, Pressable } from "../../ui/index.ts";
import { badgeText, type NotifyEntry } from "./notifications.ts";

interface ListProps {
  entries: NotifyEntry[];
  now: Date;
  onOpen: (id: string) => void;
}

export function NotificationList({ entries, now, onOpen }: ListProps) {
  return (
    <>
      <h2 className="notif-heading">Notifications</h2>
      {entries.length === 0 && <p className="notif-empty">Nothing needs you right now</p>}
      {entries.map(({ thread, tone, label, unseen }) => (
        <Pressable key={thread.id} className="notif-row" onClick={() => onOpen(thread.id)}>
          <span className="notif-title">{threadTitle(thread)}</span>
          <Badge variant={tone}>{label}</Badge>
          <span className="notif-age">{relativeTime(thread.lastActivityAt, now)}</span>
          {unseen && <span className="notif-dot" role="img" aria-label="Unseen" />}
        </Pressable>
      ))}
    </>
  );
}

function Toast({ entry, onOpen, onDismiss }: { entry: NotifyEntry; onOpen: (id: string) => void; onDismiss: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (box.current) enter(box.current, { y: -6 });
  }, []);
  const id = entry.thread.id;
  return (
    <div className="notif-toast" ref={box}>
      <Pressable className="notif-toast-body" onClick={() => onOpen(id)}>
        <span className="notif-title">{threadTitle(entry.thread)}</span>
        <Badge variant={entry.tone}>{entry.label}</Badge>
      </Pressable>
      <IconButton size="sm" label="Dismiss" onClick={() => onDismiss(id)}>
        <Icon name="x" />
      </IconButton>
    </div>
  );
}

export function NotificationToasts({ toasts, onOpen, onDismiss }: { toasts: NotifyEntry[]; onOpen: (id: string) => void; onDismiss: (id: string) => void }) {
  return (
    <div className="notif-toasts" aria-live="polite">
      {toasts.map((entry) => (
        <Toast key={entry.thread.id} entry={entry} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export function NotificationBell({ entries, count, now, onOpen }: ListProps & { count: number }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton ref={button} className="notif-bell" label={count > 0 ? `Notifications, ${count} unread` : "Notifications"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="bell" strokeWidth={1.8} />
        {count > 0 && <span className="notif-count">{badgeText(count)}</span>}
      </IconButton>
      {open && (
        <Popover
          anchor={button}
          align="end"
          className="notif-menu"
          role="dialog"
          onClose={(reason) => {
            setOpen(false);
            if (reason === "escape") button.current?.focus();
          }}
        >
          <NotificationList
            entries={entries}
            now={now}
            onOpen={(id) => {
              setOpen(false);
              onOpen(id);
            }}
          />
        </Popover>
      )}
    </>
  );
}
