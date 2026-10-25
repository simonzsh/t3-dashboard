import { useEffect, useState } from "react";
import type { AutomationsResult } from "../../../../shared/api.ts";
import { api } from "../../api/client.ts";

const POLL_MS = 60_000;

// Polls only while the Agents tab is open; it reloads at once on each opening.
export function useAutomations(active: boolean): { result: AutomationsResult | null; error: string | null } {
  const [result, setResult] = useState<AutomationsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const load = () =>
      api.getAutomations().then(
        (r) => {
          if (stopped) return;
          setResult(r);
          setError(null);
        },
        (e: unknown) => {
          if (!stopped) setError(e instanceof Error ? e.message : String(e));
        },
      );
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active]);

  return { result, error };
}
