// The part of the Sessions strip that every device shares: which conversations are open.
// Order, focus and maximize stay per device.

/** Open sessions in total: only a bound against a runaway body. */
export const SESSIONS_MAX = 100;
export const HISTORY_LIMIT = 20;

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
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { ids } = value as { ids?: unknown };
  if (!Array.isArray(ids)) return null;
  return { ids: [...new Set(ids.filter((id): id is string => typeof id === "string"))].slice(0, SESSIONS_MAX) };
}
