import { useEffect, useState } from "react";
import type { AutomationsResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { usePoll } from "../../lib/usePoll.ts";

const POLL_MS = 60_000;

// Polls only while the Agents tab is open; it reloads at once on each opening.
export function useAutomations(active: boolean): { result: AutomationsResult | null; error: string | null } {
  const api = useApi();
  const [result, setResult] = useState<AutomationsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.getAutomations().then(
      (r) => {
        setResult(r);
        setError(null);
      },
      (e: unknown) => setError(errorMessage(e)),
    );
  useEffect(() => {
    if (active) void load();
  }, [active]);
  usePoll(load, active ? POLL_MS : null);

  return { result, error };
}
