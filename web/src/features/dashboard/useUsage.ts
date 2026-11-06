import { useCallback, useEffect, useRef, useState } from "react";
import type { UsageOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { startUsagePoll } from "./usagePoll.ts";

export interface UsageState {
  usage: UsageOverview | null;
  /** The last read failed; `usage` still holds the last good value. */
  error: string | null;
  loading: boolean;
  /** Reads again now and asks T3 for a fresh scan. */
  refresh: () => void;
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
      {
        read: (f) => api.getUsage(zone, f),
        schedule: (fn, ms) => {
          const id = setTimeout(fn, ms);
          return () => clearTimeout(id);
        },
        emit: (p) => {
          if (p.usage) setUsage(p.usage);
          if (p.error !== undefined) setError(p.error);
          setLoading(p.loading);
        },
      },
      force,
    );
  }, [api, enabled, run]);

  const refresh = useCallback(() => {
    forceNext.current = true;
    setRun((n) => n + 1);
  }, []);
  return { usage, error, loading, refresh };
}
