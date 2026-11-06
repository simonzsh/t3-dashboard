import { uniqueStrings } from "../../../../shared/guards.ts";
import { readJson, writeKey, type Store } from "../../lib/storage.ts";

const KEY = "t3-dashboard-switcher-history";
export const HISTORY_LIMIT = 20;

export const recordOpened = (ids: readonly string[], id: string): string[] => [id, ...ids.filter((x) => x !== id)].slice(0, HISTORY_LIMIT);

// Anything unexpected in storage gives an empty history, never an exception.
export const loadHistory = (storage: Store | null): string[] => uniqueStrings(readJson(storage, KEY), HISTORY_LIMIT);

export const saveHistory = (storage: Store | null, ids: readonly string[]): void => writeKey(storage, KEY, JSON.stringify(ids));
