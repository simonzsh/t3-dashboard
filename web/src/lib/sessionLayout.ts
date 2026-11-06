import { useCallback, useState } from "react";
import { browserStorage, readKey, writeKey, type Store } from "./storage.ts";

export type SessionLayout = "columns" | "grid";

export const SESSION_LAYOUT_KEY = "t3-dashboard-sessions-layout";

export const parseSessionLayout = (raw: string | null): SessionLayout => (raw === "grid" ? "grid" : "columns");

export const loadSessionLayout = (storage: Store | null): SessionLayout => parseSessionLayout(readKey(storage, SESSION_LAYOUT_KEY));

export const saveSessionLayout = (storage: Store | null, layout: SessionLayout): void => writeKey(storage, SESSION_LAYOUT_KEY, layout);

export function useSessionLayout(): [SessionLayout, (layout: SessionLayout) => void] {
  const [layout, setLayout] = useState(() => loadSessionLayout(browserStorage()));
  const change = useCallback((next: SessionLayout) => {
    setLayout(next);
    saveSessionLayout(browserStorage(), next);
  }, []);
  return [layout, change];
}
