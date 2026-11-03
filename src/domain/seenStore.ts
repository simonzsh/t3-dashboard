import { mergeSeen, type SeenChange, type SeenState } from "../../shared/seen.ts";

/** The shared seen state, kept in memory and saved through `persist` on each change. */
export class SeenStore {
  private seen: SeenState | null;
  private readonly persist: (seen: SeenState) => void;

  constructor(seen: SeenState | null, persist: (seen: SeenState) => void) {
    this.seen = seen;
    this.persist = persist;
  }

  get(): SeenState | null {
    return this.seen;
  }

  /** The new state, or null when the change did not alter anything. */
  apply(change: SeenChange): SeenState | null {
    const next = mergeSeen(this.seen, change);
    if (!next || next === this.seen) return null;
    this.persist(next);
    this.seen = next;
    return next;
  }
}
