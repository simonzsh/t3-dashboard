import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutAction } from "./shortcuts.ts";

export function useShortcuts(onAction: (action: ShortcutAction) => void, dialogOpen: boolean, onDesk: boolean): void {
  // Refs keep one listener alive while the handler and the dialog flag change.
  const handler = useRef(onAction);
  const blocked = useRef(dialogOpen);
  const desk = useRef(onDesk);
  handler.current = onAction;
  blocked.current = dialogOpen;
  desk.current = onDesk;

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      const info = { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: el };
      const action = matchShortcut(info, blocked.current, desk.current);
      if (!action) return;
      e.preventDefault();
      handler.current(action);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
