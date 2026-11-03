import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStatus } from "../../../../shared/status.ts";
import type { DashboardThread } from "../../../../shared/threads.ts";
import { browserStorage } from "../../lib/storage.ts";
import { loadSeen, markSeen as mark, notifyEntries, prune, saveSeen, statusMap, transitions, unseenCount, type NotifyEntry, type SeenState } from "./notifications.ts";

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
        const next = prune(mark(prev, id, at));
        saveSeen(browserStorage(), next);
        return next;
      });
      dismiss(id);
    },
    [dismiss],
  );

  useEffect(() => {
    if (!threads) return;
    if (!seen.since) setSeen(loadSeen(browserStorage(), threads));
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
  }, [threads, seen.since, markSeen, dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Until the baseline exists, finished threads count as seen: no full badge on a first visit.
  const ready = seen.since ? seen : { since: "9999", seen: {} };
  const entries = useMemo(() => notifyEntries(threads ?? [], ready), [threads, ready]);
  const count = useMemo(() => unseenCount(threads ?? [], ready), [threads, ready]);
  const clearToasts = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setToasts([]);
  }, []);
  return { entries, count, toasts, dismiss, markSeen, clearToasts };
}
