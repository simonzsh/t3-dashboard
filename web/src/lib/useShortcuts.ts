import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutAction } from "./shortcuts.ts";

export function useShortcuts(onAction: (action: ShortcutAction) => void, dialogOpen: boolean, inSessions: boolean): void {
  // Refs keep one listener alive while the handler and the dialog flag change.
  const handler = useRef(onAction);
  const blocked = useRef(dialogOpen);
  const sessions = useRef(inSessions);
  handler.current = onAction;
  blocked.current = dialogOpen;
  sessions.current = inSessions;

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      const info = { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, target: el };
      const action = matchShortcut(info, blocked.current, sessions.current);
      if (!action) return;
      e.preventDefault();
      handler.current(action);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
