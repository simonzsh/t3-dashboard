import { readKey, writeKey, type Store } from "../../lib/storage.ts";

const KEY = "t3-dashboard-switcher-history";
export const HISTORY_LIMIT = 20;

export const recordOpened = (ids: readonly string[], id: string): string[] => [id, ...ids.filter((x) => x !== id)].slice(0, HISTORY_LIMIT);

// Anything unexpected in storage gives an empty history, never an exception.
export function loadHistory(storage: Store | null): string[] {
  try {
    const data: unknown = JSON.parse(readKey(storage, KEY) ?? "null");
    return Array.isArray(data) ? [...new Set(data.filter((v): v is string => typeof v === "string"))].slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export const saveHistory = (storage: Store | null, ids: readonly string[]): void => writeKey(storage, KEY, JSON.stringify(ids));
