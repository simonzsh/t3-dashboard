import { useEffect, useRef } from "react";

/** Calls `fn` each time `flag` goes from false to true, not on mount. */
export function useTurnOn(flag: boolean, fn: () => void): void {
  const was = useRef(flag);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (flag && !was.current) latest.current();
    was.current = flag;
  }, [flag]);
}
