import { useCallback, useState } from "react";
import { usePersisted } from "../../lib/storage.ts";
import { DEFAULT_LAYOUT, loadLayout, saveLayout, type DashboardLayout } from "./layout.ts";

/** The Dashboard layout of this browser, and the edit mode, which ends when Dashboard is not open (`active` false). */
export function useDashboardLayout(active: boolean) {
  const [layout, setLayout] = usePersisted<DashboardLayout>(loadLayout, saveLayout);
  const [editing, setEditing] = useState(false);
  if (!active && editing) setEditing(false);
  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), [setLayout]);
  return { layout, editing, setEditing, setLayout, reset };
}
