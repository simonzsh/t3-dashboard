export type WindowShortcut = `window-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export type ShortcutAction =
  | "home"
  | "sessions"
  | "automations"
  | "new-session"
  | "new-automation"
  | "settings"
  | "toggle-sidebar"
  | "switcher"
  | "close-window"
  | "toggle-fullscreen"
  | "unmaximize"
  | "focus-left"
  | "focus-right"
  | "focus-up"
  | "focus-down"
  | WindowShortcut;

export interface KeyInfo {
  key: string;
  // Alt+digit gives another character on some layouts, so digits are also read from the code.
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  target: { tagName: string; isContentEditable: boolean } | null;
}

// Ctrl+key works everywhere, fields included, like Ctrl+S for the stash. Cmd stays the browser's.
const CTRL_KEYS: Record<string, ShortcutAction> = { "1": "home", "2": "sessions", "3": "automations", n: "new-session", ",": "settings", b: "toggle-sidebar" };
const CTRL_SESSIONS_KEYS: Record<string, ShortcutAction> = { x: "close-window", f: "toggle-fullscreen" };
// Plain keys that a field needs for itself: they act only outside fields.
const PLAIN_SESSIONS_KEYS: Record<string, ShortcutAction> = {
  escape: "unmaximize",
  arrowleft: "focus-left",
  arrowright: "focus-right",
  arrowup: "focus-up",
  arrowdown: "focus-down",
};
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** How a Ctrl shortcut reads in a tooltip or a key cap: ⌃N on a Mac, Ctrl+N elsewhere. */
export const ctrlLabel = (key: string): string => (isMac ? `⌃${key}` : `Ctrl+${key}`);

function windowShortcut(e: KeyInfo): WindowShortcut | null {
  const digit = /^Digit([1-9])$/.exec(e.code ?? "")?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
  return digit ? (`window-${digit}` as WindowShortcut) : null;
}

export function matchShortcut(e: KeyInfo, dialogOpen: boolean, inSessions = false): ShortcutAction | null {
  const key = e.key.toLowerCase();
  // Before the guards: the switcher opens from a field or a dialog too, and App decides.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && key === "k") return "switcher";
  if (dialogOpen || e.metaKey) return null;
  if (e.ctrlKey) {
    if (e.altKey) return inSessions && !e.shiftKey ? windowShortcut(e) : null;
    if (key === "n" && e.shiftKey) return "new-automation";
    if (e.shiftKey) return null;
    return CTRL_KEYS[key] ?? (inSessions ? CTRL_SESSIONS_KEYS[key] : undefined) ?? null;
  }
  if (e.altKey || e.shiftKey || !inSessions) return null;
  if (e.target && (TYPING.has(e.target.tagName) || e.target.isContentEditable)) return null;
  return PLAIN_SESSIONS_KEYS[key] ?? null;
}

/** A plain character typed outside any field: on the Sessions page it goes to the focused window's message field. */
export function startsTyping(e: KeyInfo): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === " ") return false;
  return !(e.target && (TYPING.has(e.target.tagName) || e.target.isContentEditable));
}
