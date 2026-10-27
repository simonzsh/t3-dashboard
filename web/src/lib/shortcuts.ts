export type WindowShortcut = `window-${1 | 2 | 3 | 4 | 5 | 6}`;

export type ShortcutAction =
  | "agents"
  | "board"
  | "desk"
  | "new-agent"
  | "new-automation"
  | "settings"
  | "switcher"
  | "close-window"
  | "toggle-fullscreen"
  | "minimize-window"
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

const KEYS: Record<string, ShortcutAction> = { "1": "agents", "2": "desk", "3": "board", n: "new-agent", ",": "settings" };
const DESK_KEYS: Record<string, ShortcutAction> = {
  x: "close-window",
  f: "toggle-fullscreen",
  m: "minimize-window",
  escape: "unmaximize",
  arrowleft: "focus-left",
  arrowright: "focus-right",
  arrowup: "focus-up",
  arrowdown: "focus-down",
};
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function windowShortcut(e: KeyInfo): WindowShortcut | null {
  const digit = /^Digit([1-6])$/.exec(e.code ?? "")?.[1] ?? (/^[1-6]$/.test(e.key) ? e.key : null);
  return digit ? (`window-${digit}` as WindowShortcut) : null;
}

export function matchShortcut(e: KeyInfo, dialogOpen: boolean, onDesk = false): ShortcutAction | null {
  // Before the guards: the switcher opens from a field or a dialog too, and App decides.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") return "switcher";
  if (dialogOpen || e.ctrlKey || e.metaKey) return null;
  if (e.target && (TYPING.has(e.target.tagName) || e.target.isContentEditable)) return null;
  if (e.altKey) return onDesk ? windowShortcut(e) : null;
  const key = e.key.toLowerCase();
  if (key === "n" && e.shiftKey) return "new-automation";
  return KEYS[key] ?? (onDesk ? DESK_KEYS[key] : undefined) ?? null;
}
