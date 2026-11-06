import type { LimitsOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { LIMITS_POLL_MS } from "./limitsView.ts";
import { usePolledRead, type ReadState } from "./pollRead.ts";

export const limitsDelay = (): number => LIMITS_POLL_MS;

// Reads while `enabled`, then again every minute.
export function useLimits(enabled: boolean): ReadState<LimitsOverview> {
  const api = useApi();
  return usePolledRead(enabled, (force) => api.getLimits(force), limitsDelay);
}
