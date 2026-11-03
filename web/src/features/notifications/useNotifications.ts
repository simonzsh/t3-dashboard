import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { joinSeen, mergeSeen, type SeenState } from "../../../../shared/seen.ts";
import type { AgentStatus } from "../../../../shared/status.ts";
import type { DashboardThread } from "../../../../shared/threads.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { baselineOf, notifyEntries, statusMap, transitions, unseenCount, type NotifyEntry } from "./notifications.ts";

const MAX_TOASTS = 3;
const TOAST_MS = 6000;

interface Options {
  /** null while T3 Code is not live: nothing changes then. */
  threads: DashboardThread[] | null;
  /** True for a thread the user is already looking at. */
  quiet: (id: string) => boolean;
  /** The last `seen` event from the server. */
  remote: SeenState | null;
  /** SSE connections so far: a reconnect loads the seen state again. */
  connects: number;
}

/** Bell entries, the unseen count and the toasts. The seen state lives on the server, shared by every device. */
export function useNotifications({ threads, quiet, remote, connects }: Options) {
  const api = useApi();
  const [seen, setSeen] = useState<SeenState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState<NotifyEntry[]>([]);
  const previous = useRef<Map<string, AgentStatus> | null>(null);
  const baselineSent = useRef(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef({ threads, quiet, seen });
  latest.current = { threads, quiet, seen };

  // The first connection follows the mount load, so only later ones load again.
  const reconnects = Math.max(connects - 1, 0);
  useEffect(() => {
    let cancelled = false;
    api.getSeen().then(
      ({ seen: saved }) => {
        if (cancelled) return;
        if (saved) setSeen((prev) => joinSeen(prev, saved));
        setLoaded(true);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [api, reconnects]);

  useEffect(() => {
    if (remote) setSeen((prev) => joinSeen(prev, remote));
  }, [remote]);

  // The server holds none yet: the first device with live threads sets the baseline. Its echo fills `seen`.
  useEffect(() => {
    if (!loaded || seen || !threads || baselineSent.current) return;
    baselineSent.current = true;
    api.markSeen({ since: baselineOf(threads) }).catch(() => {
      baselineSent.current = false;
    });
  }, [api, loaded, seen, threads]);

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.thread.id !== id));
  }, []);

  const markSeen = useCallback(
    (id: string) => {
      const { threads: live, seen: current } = latest.current;
      const change = { id, at: live?.find((t) => t.id === id)?.lastActivityAt ?? new Date().toISOString() };
      // Without a baseline every finished thread counts as seen already: nothing to mark.
      if (current && mergeSeen(current, change) !== current) {
        setSeen((prev) => (prev ? mergeSeen(prev, change) : prev));
        api.markSeen(change).catch(() => {});
      }
      dismiss(id);
    },
    [api, dismiss],
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

  // Until the server state is known, finished threads count as seen: no full badge on a first visit.
  const ready = seen ?? { since: "9999", seen: {} };
  const entries = useMemo(() => notifyEntries(threads ?? [], ready), [threads, ready]);
  const count = useMemo(() => unseenCount(threads ?? [], ready), [threads, ready]);
  const clearToasts = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setToasts([]);
  }, []);
  return { entries, count, toasts, dismiss, markSeen, clearToasts };
}
