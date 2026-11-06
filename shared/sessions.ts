import { isObject, uniqueStrings } from "./guards.ts";

// The part of the Sessions strip that every device shares: which conversations are open.
// Order, focus and maximize stay per device.

/** Open sessions in total: only a bound against a runaway body. */
export const SESSIONS_MAX = 100;

export interface SharedSessions {
  /** Thread ids of the open sessions, in no meaningful order. */
  ids: string[];
}

export interface SessionsUpdate {
  sessions: SharedSessions;
  /** The client that made the change, so it can ignore its own echo. */
  origin: string;
}

/** Null when the value is not a sessions set at all; otherwise unique string ids, capped. */
export function normalizeSessions(value: unknown): SharedSessions | null {
  if (!isObject(value) || !Array.isArray(value.ids)) return null;
  return { ids: uniqueStrings(value.ids, SESSIONS_MAX) };
}
