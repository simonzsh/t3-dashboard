// Usage limits of the providers, read from T3's server.getConfig.
export type LimitWindowKind = "session" | "weekly" | "monthly" | "other";

export interface LimitWindow {
  id: string;
  kind: LimitWindowKind;
  /** "Session", "Weekly", "Weekly · Opus". */
  label: string;
  /** 0..100, clamped by the server. */
  usedPercent: number;
  resetsAt: string | null;
  windowMinutes: number | null;
}

export interface ProviderLimits {
  instanceId: string;
  /** T3 driver slug, e.g. "codex" or "cursor": picks the icon and the sort order. */
  driver: string;
  name: string;
  windows: LimitWindow[];
  /** Banked reset credits; 0 when none. */
  resetCredits: number;
  checkedAt: string | null;
}

export interface LimitsOverview {
  /** False when no provider carries usageLimits: T3 Code is too old. */
  supported: boolean;
  providers: ProviderLimits[];
  /** ISO time the server read T3. */
  readAt: string;
}
