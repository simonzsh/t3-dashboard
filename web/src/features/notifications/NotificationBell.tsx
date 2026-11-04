import { useLayoutEffect, useRef } from "react";
import { ctrlLabel } from "../../lib/shortcuts.ts";
import { relativeTime } from "../../lib/format.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
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
          <ProviderIcon provider={thread.provider} />
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
        <ProviderIcon provider={entry.thread.provider} />
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

// Open state lives in the caller, so a shortcut can toggle the menu too.
export function NotificationBell({ entries, count, now, onOpen, open, onOpenChange }: ListProps & { count: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton
        ref={button}
        className="notif-bell"
        label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        kbd={ctrlLabel("B")}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {/* The badge hangs on the icon, not the button corner, so it never covers the shortcut. */}
        <span className="notif-icon">
          <Icon name="bell" strokeWidth={1.8} />
          {count > 0 && <span className="notif-count">{badgeText(count)}</span>}
        </span>
      </IconButton>
      {open && (
        <Popover
          anchor={button}
          align="end"
          className="notif-menu"
          role="dialog"
          onClose={(reason) => {
            onOpenChange(false);
            if (reason === "escape") button.current?.focus();
          }}
        >
          <NotificationList
            entries={entries}
            now={now}
            onOpen={(id) => {
              onOpenChange(false);
              onOpen(id);
            }}
          />
        </Popover>
      )}
    </>
  );
}
