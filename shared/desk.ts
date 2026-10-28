// The part of the Desk that every device shares; focus, maximize and sizes stay per device.

/** Windows on the Desk, visible or minimized. */
export const DESK_LIMIT = 6;
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
  for (const w of windows) {
    const { id, minimized } = (typeof w === "object" && w !== null ? w : {}) as { id?: unknown; minimized?: unknown };
    if (typeof id !== "string" || kept.some((x) => x.id === id)) continue;
    kept.push({ id, minimized: minimized === true });
    if (kept.length === DESK_LIMIT) break;
  }
  const ids = [...new Set(history.filter((v): v is string => typeof v === "string"))].slice(0, HISTORY_LIMIT);
  return { windows: kept, history: ids };
}
