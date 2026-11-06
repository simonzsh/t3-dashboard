import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UsageOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { documentPage, startPoll, type PageVisibility } from "../../lib/usePoll.ts";
import { pollDelay } from "./usageView.ts";

export interface UsageState {
  usage: UsageOverview | null;
  /** The last read failed; `usage` still holds the last good value. */
  error: string | null;
  loading: boolean;
  /** Reads again now and asks T3 for a fresh scan. */
  refresh: () => void;
}

export interface UsagePatch {
  usage?: UsageOverview;
  error?: string | null;
  loading: boolean;
}

// Reads at once, then again after pollDelay. An error keeps the last good value (no `usage` in the patch).
export function startUsagePoll(read: (force: boolean) => Promise<UsageOverview>, emit: (patch: UsagePatch) => void, force: boolean, page: PageVisibility = documentPage): () => void {
  let stopped = false;
  let delay = pollDelay(false);
  let stopPoll: (() => void) | undefined;
  const run = async (forced: boolean) => {
    emit({ loading: true });
    let patch: UsagePatch;
    try {
      const usage = await read(forced);
      delay = pollDelay(usage.cost.refreshing);
      patch = { usage, error: null, loading: false };
    } catch (e) {
      delay = pollDelay(false);
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

// Reads while `enabled`, then again every minute, or every 10 s while T3 still scans.
export function useUsage(enabled: boolean): UsageState {
  const api = useApi();
  const [usage, setUsage] = useState<UsageOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState(0);
  // One-shot: only the first read after a manual refresh asks T3 for a fresh scan.
  const forceNext = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const force = forceNext.current;
    forceNext.current = false;
    return startUsagePoll(
      (f) => api.getUsage(zone, f),
      (p) => {
        if (p.usage) setUsage(p.usage);
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
  return useMemo(() => ({ usage, error, loading, refresh }), [usage, error, loading, refresh]);
}
