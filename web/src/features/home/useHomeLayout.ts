import { useCallback, useEffect, useState } from "react";
import { browserStorage } from "../../lib/storage.ts";
import { DEFAULT_LAYOUT, loadLayout, saveLayout, type HomeLayout } from "./layout.ts";

/** The Home layout of this browser, and the edit mode, which ends when Home is not the open page. */
export function useHomeLayout(active: boolean) {
  const [layout, setLayoutState] = useState<HomeLayout>(() => loadLayout(browserStorage()));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!active) setEditing(false);
  }, [active]);
  const setLayout = useCallback((next: HomeLayout) => {
    setLayoutState(next);
    saveLayout(browserStorage(), next);
  }, []);
  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), [setLayout]);
  return { layout, editing, setEditing, setLayout, reset };
}
