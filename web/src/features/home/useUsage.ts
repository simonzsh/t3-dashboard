import { useCallback, useEffect, useState } from "react";
import type { UsageOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { pollDelay } from "./usageView.ts";

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
  const [forced, setForced] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async (force: boolean) => {
      setLoading(true);
      let wait = pollDelay(false);
      try {
        const next = await api.getUsage(zone, force);
        if (stopped) return;
        setUsage(next);
        setError(null);
        wait = pollDelay(next.cost.refreshing);
      } catch (e) {
        if (stopped) return;
        setError(errorMessage(e));
      } finally {
        if (!stopped) {
          setLoading(false);
          timer = setTimeout(() => void read(false), wait);
        }
      }
    };
    void read(forced > 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [api, enabled, forced]);

  const refresh = useCallback(() => setForced((n) => n + 1), []);
  return { usage, error, loading, refresh };
}
