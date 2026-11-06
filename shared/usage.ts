// Usage shown on the Dashboard: turns from T3 threads, cost and tokens from T3's usage scan.

/** One local day. Cost and tokens are machine-wide; turns count T3 threads only. */
export interface UsageDay {
  /** "YYYY-MM-DD" in the time zone the client asked for. */
  day: string;
  turns: number;
  costUsd: number;
  /** Uncached + cached + cache-creation input tokens. */
  inputTokens: number;
  /** The cached part of `inputTokens`. */
  cachedInputTokens: number;
  outputTokens: number;
}

export type UsageTotals = Omit<UsageDay, "day">;

/** ok: every record priced; partial: some records unpriced; unavailable: T3 sent no usage. */
export type UsageCostStatus = "ok" | "partial" | "unavailable";

export interface UsageOverview {
  /** Always 14 entries, oldest first, the last one is today; days with no data hold zeros. */
  days: UsageDay[];
  /** The last 7 days (today included) and the 7 days before them, for the deltas. */
  thisWeek: UsageTotals;
  lastWeek: UsageTotals;
  /** T3 threads with at least one turn in each period. */
  sessions: { thisWeek: number; lastWeek: number };
  /** True when some thread histories could not be read: turns may be low. */
  turnsPartial: boolean;
  cost: {
    status: UsageCostStatus;
    /** Why cost is unavailable, shown as is; null otherwise. */
    detail: string | null;
    /** T3 is still scanning: a later call may hold more. */
    refreshing: boolean;
  };
  /** ISO time the overview was built. */
  readAt: string;
}
