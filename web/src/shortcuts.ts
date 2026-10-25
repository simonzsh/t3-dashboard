export type ShortcutAction = "agents" | "board" | "new-agent" | "settings";

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: { tagName: string; isContentEditable: boolean } | null;
}

const KEYS: Record<string, ShortcutAction> = { "1": "agents", "2": "board", n: "new-agent", ",": "settings" };
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function matchShortcut(e: KeyInfo, dialogOpen: boolean): ShortcutAction | null {
  if (dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.target && (TYPING.has(e.target.tagName) || e.target.isContentEditable)) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}
