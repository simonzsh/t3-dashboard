import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PrDetail, PrDiff, PrRef } from "../../../../shared/pulls.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";

interface Part<T> {
  value: T | null;
  error: string | null;
}
const EMPTY = { value: null, error: null };

/** One pull request and its diff, read in parallel: a failing diff keeps the header. */
export function usePrDetail({ repository, number }: PrRef) {
  const api = useApi();
  const [detail, setDetail] = useState<Part<PrDetail>>(EMPTY);
  const [diff, setDiff] = useState<Part<PrDiff>>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = async (refresh: boolean): Promise<void> => {
    const id = ++seq.current;
    const ref = { repository, number };
    // The previous value stays on screen when a refresh fails.
    const settle = <T,>(set: Dispatch<SetStateAction<Part<T>>>, what: string) => ({
      ok: (value: T) => id === seq.current && set({ value, error: null }),
      fail: (e: unknown) => id === seq.current && set((prev) => ({ value: prev.value, error: failure(what, e) })),
    });
    const d = settle(setDetail, "load the pull request");
    const f = settle(setDiff, "load the diff");
    await Promise.all([api.getPr(ref, refresh).then(d.ok, d.fail), api.getPrDiff(ref, refresh).then(f.ok, f.fail)]);
  };

  useEffect(() => {
    setDetail(EMPTY);
    setDiff(EMPTY);
    void load(false);
    return () => void seq.current++;
  }, [repository, number]);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }
  return { detail: detail.value, detailError: detail.error, diff: diff.value, diffError: diff.error, refreshing, refresh };
}
