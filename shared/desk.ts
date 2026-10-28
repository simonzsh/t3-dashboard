// The part of the Desk that every device shares: which conversations are on it.
// Order, minimized windows, focus, maximize and sizes stay per device.

/** Windows shown in the grid at once; the others wait minimized in the dock. */
export const DESK_LIMIT = 6;
/** Windows on the Desk, minimized ones included: only a bound against a runaway body. */
export const DESK_WINDOWS_MAX = 100;
export const HISTORY_LIMIT = 20;

export interface SharedDesk {
  /** Thread ids on the Desk, in no meaningful order. */
  ids: string[];
}

export interface DeskUpdate {
  desk: SharedDesk;
  /** The client that made the change, so it can ignore its own echo. */
  origin: string;
}

/** Null when the value is not a desk at all; otherwise unique string ids, capped. */
export function normalizeDesk(value: unknown): SharedDesk | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { ids, windows } = value as { ids?: unknown; windows?: unknown };
  // v0.5.7 saved `windows` with their state: only the ids still count.
  const raw = Array.isArray(ids) ? ids : Array.isArray(windows) ? windows.map((w) => (typeof w === "object" && w !== null ? (w as { id?: unknown }).id : undefined)) : null;
  if (!raw) return null;
  return { ids: [...new Set(raw.filter((id): id is string => typeof id === "string"))].slice(0, DESK_WINDOWS_MAX) };
}
