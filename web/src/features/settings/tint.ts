import { readKey, writeKey, type Store } from "../../lib/storage.ts";

export const TINT_KEY = "t3-dashboard-tint";

// Off unless "on" is saved: the neutral grays stay the default.
export const parseTint = (raw: string | null): boolean => raw === "on";

export const loadTint = (storage: Store | null): boolean => parseTint(readKey(storage, TINT_KEY));

export const saveTint = (storage: Store | null, on: boolean): void => writeKey(storage, TINT_KEY, on ? "on" : "off");
