// The part of the Desk that every device shares; focus, maximize and sizes stay per device.

/** Windows shown in the grid at once; the others wait minimized in the dock. */
export const DESK_LIMIT = 6;
/** Windows on the Desk, minimized ones included: only a bound against a runaway body. */
export const DESK_WINDOWS_MAX = 100;
export const HISTORY_LIMIT = 20;

export interface SharedDesk {
  /** Opening order: the first window is the oldest. */
  windows: Array<{ id: string; minimized: boolean }>;
  /** Thread ids opened on the Desk, most recent first. */
  history: string[];
}

export interface DeskUpdate {
  desk: SharedDesk;
  /** The client that made the change, so it can ignore its own echo. */
  origin: string;
}

/** Null when the value is not a desk at all; otherwise a desk with duplicates and surplus dropped. */
export function normalizeDesk(value: unknown): SharedDesk | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { windows, history } = value as { windows?: unknown; history?: unknown };
  if (!Array.isArray(windows) || !Array.isArray(history)) return null;
  const kept: SharedDesk["windows"] = [];
  let visible = 0;
  for (const w of windows) {
    const { id, minimized } = (typeof w === "object" && w !== null ? w : {}) as { id?: unknown; minimized?: unknown };
    if (typeof id !== "string" || kept.some((x) => x.id === id)) continue;
    // Minimized windows stay in the dock; a visible one past the grid limit joins them.
    const shown = minimized !== true && visible < DESK_LIMIT;
    if (shown) visible++;
    kept.push({ id, minimized: !shown });
    if (kept.length === DESK_WINDOWS_MAX) break;
  }
  const ids = [...new Set(history.filter((v): v is string => typeof v === "string"))].slice(0, HISTORY_LIMIT);
  return { windows: kept, history: ids };
}
