import { useCallback, useState } from "react";
import { browserStorage } from "../../lib/storage.ts";
import { DEFAULT_LAYOUT, loadLayout, saveLayout, type DashboardLayout } from "./layout.ts";

/** The Dashboard layout of this browser, and the edit mode, which ends when Dashboard is not open or the screen is a phone (`active` false). */
export function useDashboardLayout(active: boolean) {
  const [layout, setLayoutState] = useState<DashboardLayout>(() => loadLayout(browserStorage()));
  const [editing, setEditing] = useState(false);
  if (!active && editing) setEditing(false);
  const setLayout = useCallback((next: DashboardLayout) => {
    setLayoutState(next);
    saveLayout(browserStorage(), next);
  }, []);
  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), [setLayout]);
  return { layout, editing, setEditing, setLayout, reset };
}
