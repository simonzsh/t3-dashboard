import type { BoardResult } from "../../shared/api.ts";

export const KEY_URL = "https://linear.app/settings/account/security";
export const KEY_PATH = ["Settings", "Account", "Security & access", "Personal API keys", "New API key"];

const REFUSED = "Linear refused this key";

/** The Board shows the setup card when there is no key or Linear refuses it. */
export function boardNeedsKey(board: BoardResult): boolean {
  if (!board.configured) return true;
  return board.workspaces.length > 0 && board.workspaces.every((workspace) => !workspace.ok && (workspace.error ?? "").startsWith(REFUSED));
}

export const maskedKey = (keyTail: string): string => `lin_api_••••${keyTail}`;
