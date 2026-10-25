import type { Diff } from "../../shared/api.ts";

/** Collects upserts and removals by id until `take`; the last change of an id wins. */
export class DiffBatch<T extends { id: string }> {
  private readonly upserted = new Map<string, T>();
  private readonly removed = new Set<string>();

  upsert(item: T): void {
    this.upserted.set(item.id, item);
    this.removed.delete(item.id);
  }

  remove(id: string): void {
    this.upserted.delete(id);
    this.removed.add(id);
  }

  merge(diff: Diff<T>): void {
    for (const item of diff.upserted) this.upsert(item);
    for (const id of diff.removed) this.remove(id);
  }

  take(): Diff<T> | null {
    if (this.upserted.size === 0 && this.removed.size === 0) return null;
    const diff = { upserted: [...this.upserted.values()], removed: [...this.removed] };
    this.clear();
    return diff;
  }

  clear(): void {
    this.upserted.clear();
    this.removed.clear();
  }
}
