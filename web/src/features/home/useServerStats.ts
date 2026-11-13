import type { ServerStats } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { usePolledRead, type ReadState } from "./pollRead.ts";

/** Faster than the other cards: the CPU figure is only worth showing while it is fresh. */
export const SERVER_POLL_MS = 10_000;

// Reads while `enabled`, then again every 10 seconds.
export function useServerStats(enabled: boolean): ReadState<ServerStats> {
  const api = useApi();
  return usePolledRead(enabled, () => api.getServerStats(), SERVER_POLL_MS);
}
