import { useLayoutEffect, useRef } from "react";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { threadTitle } from "../../lib/threads.ts";
import { Badge, enter, Icon, IconButton, Pressable } from "../../ui/index.ts";
import type { NotifyEntry } from "./notifications.ts";

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
        <AutomationMark id={id} />
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
