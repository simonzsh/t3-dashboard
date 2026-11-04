import { STASH_LIMIT, type StashBody, type StashEntry } from "../../shared/stash.ts";

export interface StashStoreOptions {
  now: () => Date;
  newId: () => string;
}

/** The stashed drafts, newest first, in memory and saved through `persist` on each change. */
export class StashStore {
  private entries: StashEntry[];
  private readonly persist: (entries: StashEntry[]) => void;
  private readonly options: StashStoreOptions;

  constructor(entries: StashEntry[], persist: (entries: StashEntry[]) => void, options: StashStoreOptions) {
    this.entries = entries;
    this.persist = persist;
    this.options = options;
  }

  list(): StashEntry[] {
    return this.entries;
  }

  /** Adds on top; the oldest entries beyond the limit leave and are returned. */
  add(body: StashBody): { entry: StashEntry; evicted: StashEntry[] } {
    const entry: StashEntry = { id: this.options.newId(), createdAt: this.options.now().toISOString(), ...body };
    const all = [entry, ...this.entries];
    const next = all.slice(0, STASH_LIMIT);
    this.persist(next);
    this.entries = next;
    return { entry, evicted: all.slice(STASH_LIMIT) };
  }

  /** The removed entry, or null when it is gone already (another device took it). */
  remove(id: string): StashEntry | null {
    const entry = this.entries.find((e) => e.id === id) ?? null;
    if (!entry) return null;
    const next = this.entries.filter((e) => e !== entry);
    this.persist(next);
    this.entries = next;
    return entry;
  }
}
