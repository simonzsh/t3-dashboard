import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LimitsOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { documentPage, startPoll, type PageVisibility } from "../../lib/usePoll.ts";
import { LIMITS_POLL_MS } from "./limitsView.ts";

export interface LimitsState {
  limits: LimitsOverview | null;
  /** The last read failed; `limits` still holds the last good value. */
  error: string | null;
  loading: boolean;
  /** Reads again now and skips the server's cache. */
  refresh: () => void;
}

export interface LimitsPatch {
  limits?: LimitsOverview;
  error?: string | null;
  loading: boolean;
}

// Reads at once, then every minute. An error keeps the last good value (no `limits` in the patch).
export function startLimitsPoll(read: (force: boolean) => Promise<LimitsOverview>, emit: (patch: LimitsPatch) => void, force: boolean, page: PageVisibility = documentPage): () => void {
  let stopped = false;
  let stopPoll: (() => void) | undefined;
  const run = async (forced: boolean) => {
    emit({ loading: true });
    let patch: LimitsPatch;
    try {
      patch = { limits: await read(forced), error: null, loading: false };
    } catch (e) {
      patch = { error: errorMessage(e), loading: false };
    }
    if (!stopped) emit(patch);
  };
  // startPoll waits before its first call: the first read runs here.
  void run(force).then(() => {
    if (!stopped) stopPoll = startPoll(() => run(false), LIMITS_POLL_MS, page);
  });
  return () => {
    stopped = true;
    stopPoll?.();
  };
}

// Reads while `enabled`, then again every minute.
export function useLimits(enabled: boolean): LimitsState {
  const api = useApi();
  const [limits, setLimits] = useState<LimitsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState(0);
  // One-shot: only the first read after a manual refresh skips the cache.
  const forceNext = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const force = forceNext.current;
    forceNext.current = false;
    return startLimitsPoll(
      (f) => api.getLimits(f),
      (p) => {
        if (p.limits) setLimits(p.limits);
        if (p.error !== undefined) setError(p.error);
        setLoading(p.loading);
      },
      force,
    );
  }, [api, enabled, run]);

  const refresh = useCallback(() => {
    forceNext.current = true;
    setRun((n) => n + 1);
  }, []);
  return useMemo(() => ({ limits, error, loading, refresh }), [limits, error, loading, refresh]);
}
