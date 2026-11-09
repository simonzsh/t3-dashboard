import { readKey, writeKey, type Store } from "./storage.ts";

const KEY = "t3-dashboard-phone-session";

export const loadPhoneSession = (storage: Store | null): boolean => readKey(storage, KEY) === "shown";

export const savePhoneSession = (storage: Store | null, shown: boolean): void =>
  writeKey(storage, KEY, shown ? "shown" : "list");
