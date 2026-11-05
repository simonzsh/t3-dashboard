/**
 * Reminders the dashboard re-armed after a run: task id -> the lastRunAt at that time.
 * T3 keeps lastRunAt on an edit, so without this the guard would pause the reminder again.
 */
export class RearmedStore {
  private marks: Record<string, string>;
  private readonly persist: (marks: Record<string, string>) => void;

  constructor(marks: Record<string, string> = {}, persist: (marks: Record<string, string>) => void = () => {}) {
    this.marks = { ...marks };
    this.persist = persist;
  }

  has(id: string, lastRunAt: string | null | undefined): boolean {
    return lastRunAt != null && this.marks[id] === lastRunAt;
  }

  mark(id: string, lastRunAt: string): void {
    if (this.marks[id] === lastRunAt) return;
    this.save({ ...this.marks, [id]: lastRunAt });
  }

  unmark(id: string): void {
    if (!(id in this.marks)) return;
    const { [id]: _gone, ...rest } = this.marks;
    this.save(rest);
  }

  /** Drops the marks of deleted tasks and of tasks that ran again. */
  prune(tasks: ReadonlyArray<{ id: string; lastRunAt?: string | null }>): void {
    const lastRun = new Map(tasks.map((task) => [task.id, task.lastRunAt]));
    const kept = Object.entries(this.marks).filter(([id, at]) => lastRun.get(id) === at);
    if (kept.length !== Object.keys(this.marks).length) this.save(Object.fromEntries(kept));
  }

  // A write error (full or read-only disk) must not stop the guard: keep the marks in memory.
  private save(next: Record<string, string>): void {
    this.marks = next;
    try {
      this.persist(next);
    } catch (error) {
      console.warn(`Could not save re-armed reminders: ${(error as Error).message}`);
    }
  }
}
