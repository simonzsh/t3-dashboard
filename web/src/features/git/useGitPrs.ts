import { useEffect, useRef, useState } from "react";
import type { PrList } from "../../../../shared/git.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { usePoll } from "../../lib/usePoll.ts";

// The server caches the list for a minute: a faster poll would read the same answer.
export const POLL_MS = 120_000;

/** The open pull requests, loaded on mount and polled while the Git page is mounted. */
export function useGitPrs() {
  const api = useApi();
  const [list, setList] = useState<PrList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }
  return { list, error, refreshing, refresh };
}
