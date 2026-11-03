import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStatus } from "../../../../shared/status.ts";
import type { DashboardThread } from "../../../../shared/threads.ts";
import { browserStorage } from "../../lib/storage.ts";
import { loadSeen, markSeen as mark, notifyEntries, saveSeen, statusMap, transitions, unseenCount, type NotifyEntry, type SeenState } from "./notifications.ts";

const MAX_TOASTS = 3;
const TOAST_MS = 6000;

/**
 * Bell entries, the unseen count and the toasts. `threads` is null while T3 Code is not live:
 * nothing changes then. `quiet(id)` is true for a thread the user is already looking at.
 */
export function useNotifications(threads: DashboardThread[] | null, quiet: (id: string) => boolean) {
  const [seen, setSeen] = useState<SeenState>(() => loadSeen(browserStorage(), threads));
  const [toasts, setToasts] = useState<NotifyEntry[]>([]);
  const previous = useRef<Map<string, AgentStatus> | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef({ threads, quiet });
  latest.current = { threads, quiet };

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.thread.id !== id));
  }, []);

  const markSeen = useCallback(
    (id: string) => {
      const at = latest.current.threads?.find((t) => t.id === id)?.lastActivityAt ?? new Date().toISOString();
      setSeen((prev) => {
        const next = mark(prev, id, at);
        saveSeen(browserStorage(), next);
        return next;
      });
      dismiss(id);
    },
    [dismiss],
  );

  useEffect(() => {
    if (!threads) return;
    const fresh = transitions(previous.current, threads);
    previous.current = statusMap(threads);
    for (const entry of fresh) {
      const id = entry.thread.id;
      if (latest.current.quiet(id)) {
        markSeen(id);
        continue;
      }
      clearTimeout(timers.current.get(id));
      timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS));
      setToasts((list) => [entry, ...list.filter((t) => t.thread.id !== id)].slice(0, MAX_TOASTS));
    }
  }, [threads, markSeen, dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const entries = useMemo(() => notifyEntries(threads ?? [], seen), [threads, seen]);
  const count = useMemo(() => unseenCount(threads ?? [], seen), [threads, seen]);
  return { entries, count, toasts, dismiss, markSeen };
}
