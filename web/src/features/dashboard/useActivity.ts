import type { UsageOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { pollDelay } from "./activityView.ts";
import { usePolledRead, type ReadState } from "./pollRead.ts";

// A minute, or 10 s while T3 still scans; an error (null) waits a minute.
export const activityDelay = (usage: UsageOverview | null): number => pollDelay(usage?.cost.refreshing ?? false);

// Reads while `enabled`; a manual refresh asks T3 for a fresh scan.
export function useActivity(enabled: boolean): ReadState<UsageOverview> {
  const api = useApi();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return usePolledRead(enabled, (force) => api.getUsage(zone, force), activityDelay);
}
