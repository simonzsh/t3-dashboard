import { useEffect, useRef } from "react";

export interface PageVisibility {
  hidden(): boolean;
  /** Calls `cb` when the page shows or hides; returns the remover. */
  onChange(cb: () => void): () => void;
}

export const documentPage: PageVisibility = {
  hidden: () => typeof document !== "undefined" && document.hidden,
  onChange: (cb) => {
    if (typeof document === "undefined") return () => {};
    document.addEventListener("visibilitychange", cb);
    return () => document.removeEventListener("visibilitychange", cb);
  },
};

// The next call starts one delay after the previous one ends, so slow answers never pile up.
// A hidden page makes no call: the loop sleeps, and calls at once when the page shows again.
export function startPoll(fn: () => Promise<unknown>, ms: number, page: PageVisibility = documentPage): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inCall = false;
  let skipped = false;
  const schedule = () => {
    timer = setTimeout(() => void tick(), ms);
  };
  // A failed call must not end the loop.
  const tick = async () => {
    timer = undefined;
    if (page.hidden()) {
      skipped = true;
      return;
    }
    inCall = true;
    try {
      await fn();
    } catch {
      // The next call retries.
    } finally {
      inCall = false;
      if (!stopped) schedule();
    }
  };
  const removeListener = page.onChange(() => {
    if (stopped || page.hidden() || !skipped) return;
    skipped = false;
    void tick();
  });
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    removeListener();
  };
}

/** Calls `fn` every `ms` while `ms` is not null; always the latest `fn`. */
export function usePoll(fn: () => Promise<unknown>, ms: number | null): void {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => (ms === null ? undefined : startPoll(() => latest.current(), ms)), [ms]);
}
