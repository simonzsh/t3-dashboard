import type { Store } from "./storage.ts";

export const SIDEBAR_KEY = "t3-dashboard-sidebar";

// Storage can throw (private mode): the sidebar then just opens expanded.
export function loadSidebarCollapsed(storage: Store | null): boolean {
  try {
    return storage?.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(storage: Store | null, collapsed: boolean): void {
  try {
    storage?.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Ignored on purpose: see loadSidebarCollapsed.
  }
}
