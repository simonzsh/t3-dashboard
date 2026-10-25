import { useEffect, useRef } from "react";

// The next call starts one delay after the previous one ends, so slow answers never pile up.
export function startPoll(fn: () => Promise<unknown>, ms: number): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  // A failed call must not end the loop.
  const tick = async () => {
    try {
      await fn();
    } catch {
      // The next call retries.
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), ms);
    }
  };
  timer = setTimeout(() => void tick(), ms);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Calls `fn` every `ms` while `ms` is not null; always the latest `fn`. */
export function usePoll(fn: () => Promise<unknown>, ms: number | null): void {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => (ms === null ? undefined : startPoll(() => latest.current(), ms)), [ms]);
}
