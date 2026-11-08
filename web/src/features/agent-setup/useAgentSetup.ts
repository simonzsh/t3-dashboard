import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSetupInventory, McpOverview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";

export interface AgentSetupState {
  value: AgentSetupInventory | null;
  /** The last read failed; `value` still holds the last good inventory. */
  error: string | null;
  loading: boolean;
  /** Server statuses for the badges; null until read, and when the read fails. */
  mcp: McpOverview | null;
  refresh: () => void;
}

/** Reads the inventory when the page opens. The MCP statuses load next to it and never block it. */
export function useAgentSetup(): AgentSetupState {
  const api = useApi();
  const [value, setValue] = useState<AgentSetupInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mcp, setMcp] = useState<McpOverview | null>(null);
  // Only the newest read may write: a slow old one must not replace a refresh.
  const latest = useRef(0);

  const load = useCallback(
    (refresh: boolean) => {
      const run = ++latest.current;
      setLoading(true);
      api.getAgentSetup(refresh).then(
        (inv) => {
          if (run !== latest.current) return;
          setValue(inv);
          setError(null);
          setLoading(false);
        },
        (e: unknown) => {
          if (run !== latest.current) return;
          setError(errorMessage(e));
          setLoading(false);
        },
      );
      // Never force the MCP read: it runs `claude mcp list`, which may start stdio servers.
      api.getMcpServers(false).then(
        (overview) => run === latest.current && setMcp(overview),
        () => {},
      );
    },
    [api],
  );

  useEffect(() => {
    load(false);
    return () => {
      latest.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  return { value, error, loading, mcp, refresh };
}
