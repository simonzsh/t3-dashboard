import type { Store } from "../../lib/storage.ts";

export const HISTORY_LIMIT = 20;
const KEY = "t3-dashboard-switcher-history";

export const recordOpened = (ids: readonly string[], id: string): string[] => [id, ...ids.filter((x) => x !== id)].slice(0, HISTORY_LIMIT);

// Anything unexpected in storage gives an empty history, never an exception.
export function loadHistory(storage: Store | null): string[] {
  try {
    const data: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (!Array.isArray(data)) return [];
    return [...new Set(data.filter((v): v is string => typeof v === "string"))].slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveHistory(storage: Store | null, ids: readonly string[]): void {
  try {
    storage?.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage full or blocked: the history only lives for this session.
  }
}
