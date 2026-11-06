import type { LimitsOverview, LimitWindow, LimitWindowKind, ProviderLimits } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { providerKind } from "../../lib/threads.ts";
import type { IconName } from "../../ui/index.ts";

export const LIMITS_POLL_MS = 60_000;

/** Within this many points of the elapsed share, the pace counts as even. */
const PACE_BAND = 5;
const MINUTE = 60_000;

export type Pace = "ahead" | "on" | "under";

export const PACE: Record<Pace, { icon: IconName; label: string }> = {
  ahead: { icon: "trendingUp", label: "Spending faster than the window elapses" },
  on: { icon: "gauge", label: "On pace with the window" },
  under: { icon: "trendingDown", label: "Headroom left in this window" },
};

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export const leftPercent = (w: LimitWindow): number => Math.round(100 - clamp(w.usedPercent, 0, 100));

/** The share of the window already gone, 0..1; null when the window has no end or no length. */
export function elapsedShare(w: LimitWindow, now: Date): number | null {
  if (w.resetsAt === null || w.windowMinutes === null) return null;
  const total = w.windowMinutes * MINUTE;
  return clamp((total - (Date.parse(w.resetsAt) - now.getTime())) / total, 0, 1);
}

/** Where the pace marker sits on the bar: the share of the window left, like the bar's quota. */
export function timeLeftPercent(w: LimitWindow, now: Date): number | null {
  const elapsed = elapsedShare(w, now);
  return elapsed === null ? null : Math.round((1 - elapsed) * 100);
}

export function pace(w: LimitWindow, now: Date): Pace | null {
  const elapsed = elapsedShare(w, now);
  if (elapsed === null) return null;
  const diff = w.usedPercent - elapsed * 100;
  return diff > PACE_BAND ? "ahead" : diff < -PACE_BAND ? "under" : "on";
}

/** "4d 15h", "2h 48m", "12m"; "now" once the reset time has passed. */
export function resetLabel(resetsAt: string | null, now: Date): string | null {
  if (resetsAt === null) return null;
  const ms = Date.parse(resetsAt) - now.getTime();
  if (ms <= 0) return "now";
  const minutes = Math.floor(ms / MINUTE);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rest}m`;
  return rest > 0 ? `${rest}m` : "<1m";
}

/** The hatch shows what is used, but only when a reset is coming. */
export const showHatch = (w: LimitWindow): boolean => leftPercent(w) < 100 && w.resetsAt !== null;

const KIND_RANK: Record<LimitWindowKind, number> = { session: 0, weekly: 1, monthly: 2, other: 3 };
export const sortWindows = (windows: LimitWindow[]): LimitWindow[] => [...windows].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);

const PROVIDER_RANK = { codex: 0, claude: 1, other: 2 };
export const sortProviders = (providers: ProviderLimits[]): ProviderLimits[] => [...providers].sort((a, b) => PROVIDER_RANK[providerKind(a.driver)] - PROVIDER_RANK[providerKind(b.driver)]);

/** "Checked 2 min ago", from the oldest provider check. */
export function oldestCheck(overview: LimitsOverview, now: Date): string {
  const times = overview.providers.flatMap((p) => (p.checkedAt && !Number.isNaN(Date.parse(p.checkedAt)) ? [p.checkedAt] : []));
  const oldest = times.length > 0 ? times.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)) : overview.readAt;
  return `Checked ${relativeTime(oldest, now)}`;
}

/** The text a screen reader gets for one bar. */
export function rowLabel(w: LimitWindow, credits: number, now: Date): string {
  const timeLeft = timeLeftPercent(w, now);
  const reset = resetLabel(w.resetsAt, now);
  const parts = [`${leftPercent(w)}% left`];
  if (timeLeft !== null) parts.push(`${timeLeft}% of the window left`);
  if (reset !== null) parts.push(reset === "now" ? "resets now" : `resets in ${reset}`);
  if (credits > 0) parts.push(`${credits} reset ${credits === 1 ? "credit" : "credits"} banked`);
  return `${w.label}: ${parts.join(", ")}`;
}
