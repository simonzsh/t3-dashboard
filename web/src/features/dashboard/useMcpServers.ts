import type { McpOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { usePolledRead, type ReadState } from "./pollRead.ts";

/** Slow: a read probes every remote server, and only a refresh asks the Claude CLI. */
export const MCP_POLL_MS = 600_000;

// Reads while `enabled`, then again every 10 minutes.
export function useMcpServers(enabled: boolean): ReadState<McpOverview> {
  const api = useApi();
  return usePolledRead(enabled, (force) => api.getMcpServers(force), MCP_POLL_MS);
}
