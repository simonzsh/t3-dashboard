import { useEffect, useRef, useState } from "react";
import type { AutomationsResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { errorMessage } from "../../lib/format.ts";
import { usePoll } from "../../lib/usePoll.ts";

const POLL_MS = 30_000;

// Polls only while the Agents tab is open; it reloads at once on each opening.
export function useAutomations(active: boolean): { result: AutomationsResult | null; error: string | null; reload: () => Promise<void> } {
  const api = useApi();
  const [result, setResult] = useState<AutomationsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A reload and a poll can overlap: only the latest request may set the state.
  const seq = useRef(0);
  const load = (): Promise<void> => {
    const id = ++seq.current;
    return api.getAutomations().then(
      (r) => {
        if (id !== seq.current) return;
        setResult(r);
        setError(null);
      },
      (e: unknown) => {
        if (id === seq.current) setError(errorMessage(e));
      },
    );
  };
  useEffect(() => {
    if (active) void load();
  }, [active]);
  usePoll(load, active ? POLL_MS : null);

  return { result, error, reload: load };
}
