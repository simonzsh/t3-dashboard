import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../lib/format.ts";
import { documentPage, startPoll, type PageVisibility } from "../../lib/usePoll.ts";

/** The default interval: Usage and Activity read once a minute. */
export const DASHBOARD_POLL_MS = 60_000;

export interface ReadState<T> {
  value: T | null;
  /** The last read failed; `value` still holds the last good value. */
  error: string | null;
  loading: boolean;
  /** Reads again now and skips the server's cache. */
  refresh: () => void;
}

export interface ReadPatch<T> {
  value?: T;
  error?: string | null;
  loading: boolean;
}

// Reads at once, then every `ms`. An error keeps the last good value (no `value` in the patch).
export function startReadPoll<T>(
  read: (force: boolean) => Promise<T>,
  emit: (patch: ReadPatch<T>) => void,
  force: boolean,
  page: PageVisibility = documentPage,
  ms = DASHBOARD_POLL_MS,
): () => void {
  let stopped = false;
  let stopPoll: (() => void) | undefined;
  const run = async (forced: boolean) => {
    emit({ loading: true });
    let patch: ReadPatch<T>;
    try {
      patch = { value: await read(forced), error: null, loading: false };
    } catch (e) {
      patch = { error: errorMessage(e), loading: false };
    }
    if (!stopped) emit(patch);
  };
  // startPoll waits before its first call: the first read runs here.
  void run(force).then(() => {
    if (!stopped) stopPoll = startPoll(() => run(false), ms, page);
  });
  return () => {
    stopped = true;
    stopPoll?.();
  };
}

// Reads while `enabled`. `read` may change each render: the latest one is used.
// A new `key` restarts the poll, for a read that depends on a choice.
export function usePolledRead<T>(enabled: boolean, read: (force: boolean) => Promise<T>, ms = DASHBOARD_POLL_MS, key: string | number = ""): ReadState<T> {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState(0);
  // One-shot: only the first read after a manual refresh skips the cache.
  const forceNext = useRef(false);
  const latest = useRef(read);
  latest.current = read;
  // A new key reads other data: the last error belongs to the old one.
  const lastKey = useRef(key);

  useEffect(() => {
    if (!enabled) return;
    if (lastKey.current !== key) {
      lastKey.current = key;
      setError(null);
    }
    const force = forceNext.current;
    forceNext.current = false;
    return startReadPoll(
      (f) => latest.current(f),
      (p) => {
        if (p.value) setValue(p.value);
        if (p.error !== undefined) setError(p.error);
        setLoading(p.loading);
      },
      force,
      documentPage,
      ms,
    );
  }, [enabled, run, ms, key]);

  const refresh = useCallback(() => {
    forceNext.current = true;
    setRun((n) => n + 1);
  }, []);
  return useMemo(() => ({ value, error, loading, refresh }), [value, error, loading, refresh]);
}
