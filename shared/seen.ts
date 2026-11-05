import type { DashboardThread } from "./threads.ts";

// Which notifications the user has read (opened, or marked as read). Every device shares it, so a thread opened
// on one device stops counting as unread on the others.

/** Marks kept at most: the oldest ones fall under the baseline instead. */
export const SEEN_CAP = 200;
const MAX_ID = 200;
const MAX_TIME = 64;

/** `since`: the baseline of the first visit. `seen`: thread id -> its lastActivityAt when it was read. */
export interface SeenState {
  since: string;
  seen: Record<string, string>;
}

/** What POST /api/seen answers: the state after the change, so a device that missed the event catches up. */
export interface SeenResult {
  ok: true;
  seen: SeenState | null;
}

/** A mark for one thread, or the baseline (kept only when none exists yet). */
export type SeenChange = { id: string; at: string } | { since: string };

const isSeenText = (value: unknown, max: number): value is string => typeof value === "string" && value !== "" && value.length <= max;
export const isSeenId = (value: unknown): value is string => isSeenText(value, MAX_ID);
// ISO-8601 only: a stray baseline such as "~" would sort after every real time and hide all threads.
export const isSeenTime = (value: unknown): value is string => isSeenText(value, MAX_TIME) && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

export const later = (a: string, b: string) => (a.localeCompare(b) >= 0 ? a : b);

// A thread is unseen while its last activity is newer than the baseline and its read mark.
// A read mark comes from opening the thread or from "Mark as read".
export const isUnseen = (t: DashboardThread, seen: SeenState) => t.lastActivityAt.localeCompare(later(seen.since, seen.seen[t.id] ?? "")) > 0;

/** Drops marks the baseline hides and keeps the newest ones. Dropped marks move the baseline up, so they stay seen. */
export function prune({ since, seen }: SeenState): SeenState {
  const kept = Object.entries(seen)
    .filter(([, at]) => at.localeCompare(since) > 0)
    .sort(([, a], [, b]) => b.localeCompare(a));
  const dropped = kept[SEEN_CAP]?.[1];
  return { since: dropped ? later(since, dropped) : since, seen: Object.fromEntries(kept.slice(0, SEEN_CAP)) };
}

/** Null when the value is not a seen state; otherwise bounded strings only. */
export function normalizeSeen(value: unknown): SeenState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { since, seen } = value as { since?: unknown; seen?: unknown };
  if (!isSeenTime(since)) return null;
  const marks = typeof seen === "object" && seen !== null && !Array.isArray(seen) ? Object.entries(seen) : [];
  return prune({ since, seen: Object.fromEntries(marks.filter(([id, at]) => isSeenId(id) && isSeenTime(at))) });
}

/**
 * Applies one change. A mark only moves forward and the baseline is set once, so merges are
 * idempotent and order does not matter. Returns `state` itself when nothing changes.
 */
export function mergeSeen(state: SeenState | null, change: SeenChange): SeenState | null {
  if ("since" in change) return state ?? { since: change.since, seen: {} };
  if (!state || change.at.localeCompare(later(state.since, state.seen[change.id] ?? "")) <= 0) return state;
  return prune({ since: state.since, seen: { ...state.seen, [change.id]: change.at } });
}

/** Folds a state received from the server into the local one. */
export function joinSeen(local: SeenState | null, remote: SeenState): SeenState {
  if (!local) return remote;
  const seen = { ...local.seen };
  for (const [id, at] of Object.entries(remote.seen)) seen[id] = later(at, seen[id] ?? "");
  return prune({ since: later(local.since, remote.since), seen });
}
