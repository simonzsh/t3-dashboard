import type { UsageOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { usePolledRead, type ReadState } from "./pollRead.ts";

// Reads while `enabled`; a manual refresh asks T3 for a fresh scan.
export function useActivity(enabled: boolean): ReadState<UsageOverview> {
  const api = useApi();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return usePolledRead(enabled, (force) => api.getUsage(zone, force));
}
