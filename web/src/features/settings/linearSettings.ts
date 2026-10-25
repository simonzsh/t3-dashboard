import type { BoardResult } from "../../../../shared/api.ts";

export const KEY_URL = "https://linear.app/settings/account/security";
export const KEY_PATH = ["Settings", "Account", "Security & access", "Personal API keys", "New API key"];

const REFUSED = "Linear refused this key";

/** The Board shows the setup card when there is no key or Linear refuses it. */
export function boardNeedsKey(board: BoardResult): boolean {
  return !board.configured || (!board.ok && (board.error ?? "").startsWith(REFUSED));
}

export const maskedKey = (keyTail: string): string => `lin_api_••••${keyTail}`;

export const linearConnected = (board: BoardResult): boolean => board.configured && board.ok;
