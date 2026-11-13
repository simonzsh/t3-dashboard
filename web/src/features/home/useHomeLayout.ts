import { useCallback, useState } from "react";
import { usePersisted } from "../../lib/storage.ts";
import { DEFAULT_LAYOUT, loadLayout, saveLayout, type HomeLayout } from "./layout.ts";

/** The Home layout of this browser, and the edit mode, which ends when Home is not open (`active` false). */
export function useHomeLayout(active: boolean) {
  const [layout, setLayout] = usePersisted<HomeLayout>(loadLayout, saveLayout);
  const [editing, setEditing] = useState(false);
  if (!active && editing) setEditing(false);
  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), [setLayout]);
  return { layout, editing, setEditing, setLayout, reset };
}
