import { useCallback, useState } from "react";
import { browserStorage, type Store } from "./storage.ts";

export type SessionLayout = "columns" | "grid";

export const SESSION_LAYOUT_KEY = "t3-dashboard-sessions-layout";

export const parseSessionLayout = (raw: string | null): SessionLayout => (raw === "grid" ? "grid" : "columns");

export function loadSessionLayout(storage: Store | null): SessionLayout {
  try {
    return parseSessionLayout(storage?.getItem(SESSION_LAYOUT_KEY) ?? null);
  } catch {
    return "columns";
  }
}

export function saveSessionLayout(storage: Store | null, layout: SessionLayout): void {
  try {
    storage?.setItem(SESSION_LAYOUT_KEY, layout);
  } catch {
    // Ignored on purpose: the layout then resets to columns on the next load.
  }
}

export function useSessionLayout(): [SessionLayout, (layout: SessionLayout) => void] {
  const [layout, setLayout] = useState(() => loadSessionLayout(browserStorage()));
  const change = useCallback((next: SessionLayout) => {
    setLayout(next);
    saveSessionLayout(browserStorage(), next);
  }, []);
  return [layout, change];
}
