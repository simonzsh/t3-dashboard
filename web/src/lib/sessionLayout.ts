import { readKey, usePersisted, writeKey, type Store } from "./storage.ts";

export type SessionLayout = "columns" | "grid";

export const SESSION_LAYOUT_KEY = "t3-dashboard-sessions-layout";

export const parseSessionLayout = (raw: string | null): SessionLayout => (raw === "grid" ? "grid" : "columns");

export const loadSessionLayout = (storage: Store | null): SessionLayout => parseSessionLayout(readKey(storage, SESSION_LAYOUT_KEY));

export const saveSessionLayout = (storage: Store | null, layout: SessionLayout): void => writeKey(storage, SESSION_LAYOUT_KEY, layout);

export const useSessionLayout = (): [SessionLayout, (layout: SessionLayout) => void] => usePersisted(loadSessionLayout, saveSessionLayout);
