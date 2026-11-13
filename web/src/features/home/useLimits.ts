import type { LimitsOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { usePolledRead, type ReadState } from "./pollRead.ts";

// Reads while `enabled`, then again every minute.
export function useLimits(enabled: boolean): ReadState<LimitsOverview> {
  const api = useApi();
  return usePolledRead(enabled, (force) => api.getLimits(force));
}
