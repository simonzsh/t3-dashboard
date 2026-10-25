import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutAction } from "./shortcuts.ts";

export function useShortcuts(onAction: (action: ShortcutAction) => void, dialogOpen: boolean): void {
  // Refs keep one listener alive while the handler and the dialog flag change.
  const handler = useRef(onAction);
  const blocked = useRef(dialogOpen);
  handler.current = onAction;
  blocked.current = dialogOpen;

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      const action = matchShortcut({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: el }, blocked.current);
      if (!action) return;
      e.preventDefault();
      handler.current(action);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
