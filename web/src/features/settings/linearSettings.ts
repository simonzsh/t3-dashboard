import type { BoardResult } from "../../../../shared/api.ts";

export const KEY_URL = "https://linear.app/settings/account/security";
export const KEY_PATH = ["Settings", "Account", "Security & access", "Personal API keys", "New API key"];

const REFUSED = "Linear refused this key";

/** True when there is no key or Linear refuses it: the Linear card stays hidden, and Settings holds the connection. */
export function boardNeedsKey(board: BoardResult): boolean {
  return !board.configured || (!board.ok && (board.error ?? "").startsWith(REFUSED));
}

export const maskedKey = (keyTail: string): string => `lin_api_••••${keyTail}`;
