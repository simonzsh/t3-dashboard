import { useEffect, useRef, useState } from "react";
import type { PrList } from "../../../../shared/pulls.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { usePoll } from "../../lib/usePoll.ts";
import { useRefresh } from "../../lib/useRefresh.ts";
import { useTurnOn } from "../../lib/useTurnOn.ts";
import { pullsPollMs, STALE_RETRY_MS } from "./pulls.ts";

/** The open pull requests: loaded and polled while `active` (faster `onPage`), and read again each time the user comes back to the list. */
export function usePulls(active: boolean, onPage: boolean, onList: boolean) {
  const api = useApi();
  const [list, setList] = useState<PrList | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A poll and a refresh can overlap: only the latest request may set the state.
  const seq = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);
  // `followUp` is the one read after a stale answer: it does not schedule another.
  const load = (refresh = false, followUp = false): Promise<void> => {
    const id = ++seq.current;
    clearTimeout(retry.current);
    return api.getPrs(refresh).then(
      (result) => {
        if (id !== seq.current) return;
        setList(result);
        setError(null);
        if (result.stale && !followUp) retry.current = setTimeout(() => void load(false, true), STALE_RETRY_MS);
      },
      (e: unknown) => {
        if (id === seq.current) setError(failure("load the pull requests", e));
      },
    );
  };
  useEffect(() => {
    if (active) void load();
  }, [active]);
  useEffect(() => () => clearTimeout(retry.current), []);
  useTurnOn(onPage && onList, () => active && void load());
  usePoll(() => load(), active ? pullsPollMs(onPage) : null);

  const { refreshing, refresh } = useRefresh(() => load(true));
  return { list, error, refreshing, refresh };
}

export type PullsState = ReturnType<typeof usePulls>;
