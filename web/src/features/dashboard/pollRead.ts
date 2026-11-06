import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../lib/format.ts";
import { documentPage, startPoll, type PageVisibility } from "../../lib/usePoll.ts";

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

// Reads at once, then again after `delayAfter(value)` (`null` after an error).
// An error keeps the last good value (no `value` in the patch).
export function startReadPoll<T>(
  read: (force: boolean) => Promise<T>,
  emit: (patch: ReadPatch<T>) => void,
  force: boolean,
  delayAfter: (value: T | null) => number,
  page: PageVisibility = documentPage,
): () => void {
  let stopped = false;
  let delay = delayAfter(null);
  let stopPoll: (() => void) | undefined;
  const run = async (forced: boolean) => {
    emit({ loading: true });
    let patch: ReadPatch<T>;
    try {
      const value = await read(forced);
      delay = delayAfter(value);
      patch = { value, error: null, loading: false };
    } catch (e) {
      delay = delayAfter(null);
      patch = { error: errorMessage(e), loading: false };
    }
    if (!stopped) emit(patch);
  };
  // startPoll waits before its first call: the first read runs here, and its answer picks the first delay.
  void run(force).then(() => {
    if (!stopped) stopPoll = startPoll(() => run(false), () => delay, page);
  });
  return () => {
    stopped = true;
    stopPoll?.();
  };
}

// Reads while `enabled`. `read` and `delayAfter` may change each render: the latest ones are used.
export function usePolledRead<T>(enabled: boolean, read: (force: boolean) => Promise<T>, delayAfter: (value: T | null) => number): ReadState<T> {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState(0);
  // One-shot: only the first read after a manual refresh skips the cache.
  const forceNext = useRef(false);
  const latest = useRef({ read, delayAfter });
  latest.current = { read, delayAfter };

  useEffect(() => {
    if (!enabled) return;
    const force = forceNext.current;
    forceNext.current = false;
    return startReadPoll(
      (f) => latest.current.read(f),
      (p) => {
        if (p.value) setValue(p.value);
        if (p.error !== undefined) setError(p.error);
        setLoading(p.loading);
      },
      force,
      (v) => latest.current.delayAfter(v),
    );
  }, [enabled, run]);

  const refresh = useCallback(() => {
    forceNext.current = true;
    setRun((n) => n + 1);
  }, []);
  return useMemo(() => ({ value, error, loading, refresh }), [value, error, loading, refresh]);
}
