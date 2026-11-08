import { useEffect, useRef, useState } from "react";
import type { PrList } from "../../../../shared/pulls.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { usePoll } from "../../lib/usePoll.ts";
import { useRefresh } from "../../lib/useRefresh.ts";

// The server caches the list for a minute: a faster poll would read the same answer.
export const POLL_MS = 120_000;

/** The open pull requests, loaded on mount and polled while the Pull requests page is mounted. */
export function usePulls() {
  const api = useApi();
  const [list, setList] = useState<PrList | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A poll and a refresh can overlap: only the latest request may set the state.
  const seq = useRef(0);
  const load = (refresh = false): Promise<void> => {
    const id = ++seq.current;
    return api.getPrs(refresh).then(
      (result) => {
        if (id !== seq.current) return;
        setList(result);
        setError(null);
      },
      (e: unknown) => {
        if (id === seq.current) setError(failure("load the pull requests", e));
      },
    );
  };
  useEffect(() => void load(), []);
  usePoll(() => load(), POLL_MS);

  const { refreshing, refresh } = useRefresh(() => load(true));
  return { list, error, refreshing, refresh };
}
