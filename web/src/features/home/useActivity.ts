import { useMemo } from "react";
import type { ActivityPeriod, UsageOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useActivityPeriod } from "./activityPeriod.ts";
import { HOME_POLL_MS, usePolledRead, type ReadState } from "./pollRead.ts";

export interface ActivityState extends ReadState<UsageOverview> {
  period: ActivityPeriod;
  setPeriod: (period: ActivityPeriod) => void;
}

// Reads while `enabled`; a manual refresh asks T3 for a fresh scan. A new period reads at once.
export function useActivity(enabled: boolean): ActivityState {
  const api = useApi();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [period, setPeriod] = useActivityPeriod();
  const read = usePolledRead(enabled, (force) => api.getUsage(zone, period, force), HOME_POLL_MS, period);
  return useMemo(() => ({ ...read, period, setPeriod }), [read, period, setPeriod]);
}
