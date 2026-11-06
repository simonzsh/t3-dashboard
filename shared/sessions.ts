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

/** Body and SSE payload of the legacy /api/desk route and `desk` event. */
export interface LegacyDeskUpdate {
  desk: SharedSessions;
  origin: string;
}

/** Null when the value is not a sessions set at all; otherwise unique string ids, capped. */
export function normalizeSessions(value: unknown): SharedSessions | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { ids, windows } = value as { ids?: unknown; windows?: unknown };
  // v0.5.7 saved `windows` with their state: only the ids still count.
  const raw = Array.isArray(ids) ? ids : Array.isArray(windows) ? windows.map((w) => (typeof w === "object" && w !== null ? (w as { id?: unknown }).id : undefined)) : null;
  if (!raw) return null;
  return { ids: [...new Set(raw.filter((id): id is string => typeof id === "string"))].slice(0, SESSIONS_MAX) };
}
