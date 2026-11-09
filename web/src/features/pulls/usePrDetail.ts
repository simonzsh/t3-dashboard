import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PrDetail, PrDiff, PrRef, PrSummary } from "../../../../shared/pulls.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { useRefresh } from "../../lib/useRefresh.ts";
import { cachedPage, diffFollowUp, diffHint, rememberPage } from "./prCache.ts";

interface Part<T> {
  value: T | null;
  error: string | null;
}
const EMPTY = { value: null, error: null };
const partsOf = (ref: PrRef): { detail: Part<PrDetail>; diff: Part<PrDiff> } => {
  const page = cachedPage(ref);
  return { detail: page?.detail ? { value: page.detail, error: null } : EMPTY, diff: page?.diff ? { value: page.diff, error: null } : EMPTY };
};

/** One pull request and its diff, read in parallel: a failing diff keeps the header. A reopened pull request starts from memory. */
export function usePrDetail({ repository, number }: PrRef, summary?: PrSummary) {
  const api = useApi();
  const [detail, setDetail] = useState<Part<PrDetail>>(() => partsOf({ repository, number }).detail);
  const [diff, setDiff] = useState<Part<PrDiff>>(() => partsOf({ repository, number }).diff);
  const seq = useRef(0);

  const load = async (refresh: boolean): Promise<void> => {
    const id = ++seq.current;
    const ref = { repository, number };
    // The previous value stays on screen when a refresh fails.
    const settle = <T,>(set: Dispatch<SetStateAction<Part<T>>>, what: string, keep: (value: T) => void) => ({
      ok: (value: T) => {
        keep(value);
        if (id === seq.current) set({ value, error: null });
        return value;
      },
      fail: (e: unknown) => {
        if (id === seq.current) set((prev) => ({ value: prev.value, error: failure(what, e) }));
        return null;
      },
    });
    const d = settle(setDetail, "load the pull request", (detail) => rememberPage(ref, { detail }));
    const f = settle(setDiff, "load the diff", (diff) => rememberPage(ref, { diff }));
    const hint = diffHint(cachedPage(ref), summary);
    const [read, readDiff] = await Promise.all([api.getPr(ref, refresh).then(d.ok, d.fail), api.getPrDiff(ref, { sha: hint, refresh }).then(f.ok, f.fail)]);
    // A diff served for the hinted commit may be older than the head: ask once for the head.
    const sha = diffFollowUp(hint, read, readDiff);
    if (sha && id === seq.current) await api.getPrDiff(ref, { sha }).then(f.ok, f.fail);
  };

  useEffect(() => {
    const kept = partsOf({ repository, number });
    setDetail(kept.detail);
    setDiff(kept.diff);
    void load(false);
    return () => void seq.current++;
  }, [repository, number]);

  const { refreshing, refresh } = useRefresh(() => load(true));
  return { detail: detail.value, detailError: detail.error, diff: diff.value, diffError: diff.error, refreshing, refresh };
}
