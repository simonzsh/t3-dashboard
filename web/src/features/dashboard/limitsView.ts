import type { LimitsOverview, LimitWindow, LimitWindowKind, ProviderLimits } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { providerKind } from "../../lib/threads.ts";

export const LIMITS_POLL_MS = 60_000;

/** Within this many points of the elapsed share, the pace counts as even. */
const PACE_BAND = 5;
const MINUTE = 60_000;

export type Pace = "ahead" | "on" | "under";
export type Severity = "ok" | "warn" | "danger";

const PACE_LABEL: Record<Pace, string> = { ahead: "Ahead of pace", on: "On pace", under: "Under pace" };
const WARN_AT = 75;
const DANGER_AT = 90;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export const usedPercent = (w: LimitWindow): number => Math.round(clamp(w.usedPercent, 0, 100));

/** The fill colour step; the number and the caption carry the same state in text. */
export const severity = (w: LimitWindow): Severity => (w.usedPercent >= DANGER_AT ? "danger" : w.usedPercent >= WARN_AT ? "warn" : "ok");

/** The share of the window already gone, 0..1; null when the window has no end or no length. */
export function elapsedShare(w: LimitWindow, now: Date): number | null {
  if (w.resetsAt === null || w.windowMinutes === null) return null;
  const total = w.windowMinutes * MINUTE;
  return clamp((total - (Date.parse(w.resetsAt) - now.getTime())) / total, 0, 1);
}

/** Where the elapsed-time tick sits on the meter. */
export function elapsedPercent(w: LimitWindow, now: Date): number | null {
  const elapsed = elapsedShare(w, now);
  return elapsed === null ? null : Math.round(elapsed * 100);
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

/** "Resets in 2h 30m · Ahead of pace"; empty when both are unknown. */
export function caption(w: LimitWindow, now: Date): string {
  const reset = resetLabel(w.resetsAt, now);
  const paceKind = pace(w, now);
  const parts = [];
  if (reset !== null) parts.push(reset === "now" ? "Resets now" : `Resets in ${reset}`);
  if (paceKind) parts.push(PACE_LABEL[paceKind]);
  return parts.join(" · ");
}

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

/** The text a screen reader gets for one meter. */
export function meterLabel(w: LimitWindow, now: Date): string {
  const elapsed = elapsedPercent(w, now);
  const reset = resetLabel(w.resetsAt, now);
  const parts = [`${usedPercent(w)}% used`];
  if (elapsed !== null) parts.push(`${elapsed}% of the window elapsed`);
  if (reset !== null) parts.push(reset === "now" ? "resets now" : `resets in ${reset}`);
  return `${w.label}: ${parts.join(", ")}`;
}
