/** One value read through `read`: kept `ttlMs` after it arrives, one read shared by concurrent callers.
 *  invalidate() drops the value and detaches a read in flight, so the next get reads again. */
export function cachedRead<T>(read: () => Promise<T>, options: { ttlMs: number; now: () => number }): { get(fresh?: boolean): Promise<T>; invalidate(): void } {
  let kept: { at: number; value: T } | null = null;
  let flight: Promise<T> | null = null;
  // A detached read must not store its value or clear a newer flight.
  let generation = 0;

  return {
    get(fresh = false) {
      if (!fresh && kept && options.now() - kept.at < options.ttlMs) return Promise.resolve(kept.value);
      if (flight) return flight;
      const mine = generation;
      const current: Promise<T> = read()
        .then((value) => {
          if (mine === generation) kept = { at: options.now(), value };
          return value;
        })
        .finally(() => {
          if (mine === generation) flight = null;
        });
      flight = current;
      return current;
    },
    invalidate() {
      generation++;
      kept = null;
      flight = null;
    },
  };
}
