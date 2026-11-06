import { useCallback } from "react";
import { readKey, usePersisted, writeKey, type Store } from "./storage.ts";

export const SIDEBAR_KEY = "t3-dashboard-sidebar";

export const loadSidebarCollapsed = (storage: Store | null): boolean => readKey(storage, SIDEBAR_KEY) === "collapsed";

export const saveSidebarCollapsed = (storage: Store | null, collapsed: boolean): void => writeKey(storage, SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");

/** Whether the sidebar is collapsed, saved in this browser, and a toggle. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = usePersisted(loadSidebarCollapsed, saveSidebarCollapsed);
  return [collapsed, useCallback(() => setCollapsed((was) => !was), [setCollapsed])];
}
