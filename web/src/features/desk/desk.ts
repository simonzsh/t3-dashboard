import { DESK_WINDOWS_MAX } from "../../../../shared/desk.ts";
import type { SessionLayout } from "../../lib/sessionLayout.ts";
import type { Store } from "../../lib/storage.ts";

export const DESK_KEY = "t3-dashboard-desk";

export interface DeskWindow {
  id: string;
}

export interface DeskState {
  // Column order, left to right: the first window is the oldest unless a swap moved it.
  windows: DeskWindow[];
  focusedId: string | null;
  maximizedId: string | null;
}

export type DeskAction =
  | { type: "open"; id: string }
  | { type: "close"; id: string }
  | { type: "focus"; id: string }
  | { type: "maximize"; id: string }
  | { type: "unmaximize" }
  | { type: "swap"; id: string; with: string }
  | { type: "sync"; ids: readonly string[] }
  | { type: "prune"; existing: ReadonlySet<string> };

export const EMPTY_DESK: DeskState = { windows: [], focusedId: null, maximizedId: null };

/** The tracks of the strip: grid view stacks two sessions per column. */
export function stripLayout(count: number, layout: SessionLayout): { columns: number; rows: number } {
  if (count <= 0) return { columns: 0, rows: 0 };
  if (layout === "columns") return { columns: count, rows: 1 };
  return { columns: Math.ceil(count / 2), rows: count > 1 ? 2 : 1 };
}

export function cellOf(index: number, layout: SessionLayout): { column: number; row: number } {
  return layout === "columns" ? { column: index, row: 0 } : { column: Math.floor(index / 2), row: index % 2 };
}

/** In grid view an odd last session has its column to itself and takes both rows. */
export const spansRows = (index: number, count: number, layout: SessionLayout): boolean => layout === "grid" && count > 1 && count % 2 === 1 && index === count - 1;

export type Direction = "left" | "right" | "up" | "down";

/** The session next to the focused one in a direction; the strip does not wrap. */
export function neighborId(state: DeskState, direction: Direction, layout: SessionLayout): string | null {
  const { windows } = state;
  if (windows.length === 0) return null;
  const from = windows.findIndex((w) => w.id === state.focusedId);
  if (from < 0) return windows[0]!.id;
  const { column, row } = cellOf(from, layout);
  if (layout === "columns") return direction === "left" ? (windows[from - 1]?.id ?? null) : direction === "right" ? (windows[from + 1]?.id ?? null) : null;
  if (direction === "up" || direction === "down") {
    const target = from + (direction === "down" ? 1 : -1);
    return Math.floor(target / 2) === column ? (windows[target]?.id ?? null) : null;
  }
  const side = column + (direction === "right" ? 1 : -1);
  if (side < 0) return null;
  return (windows[side * 2 + row] ?? windows[side * 2])?.id ?? null;
}

/** The first session of the n-th column (1 based), or null past the last column. */
export function columnLeadId(state: DeskState, n: number, layout: SessionLayout): string | null {
  return state.windows[layout === "columns" ? n - 1 : 2 * (n - 1)]?.id ?? null;
}

/** The window `step` places after `id` in column order (negative: before), or null past either end. */
export function stepId(windows: readonly DeskWindow[], id: string, step: 1 | -1): string | null {
  const at = windows.findIndex((w) => w.id === id);
  return at < 0 ? null : (windows[at + step]?.id ?? null);
}

// Keeps the invariants: focus and maximize point at open windows.
function settle(state: DeskState): DeskState {
  const isOpen = (id: string | null) => id !== null && state.windows.some((w) => w.id === id);
  const maximizedId = isOpen(state.maximizedId) ? state.maximizedId : null;
  const focusedId = isOpen(state.focusedId) ? state.focusedId : (state.windows.at(-1)?.id ?? null);
  return { ...state, maximizedId, focusedId };
}

function show(state: DeskState, id: string): DeskState {
  return settle({ ...state, focusedId: id, maximizedId: state.maximizedId === id ? id : null });
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case "open":
      if (state.windows.some((w) => w.id === action.id)) return show(state, action.id);
      return show({ ...state, windows: [...state.windows, { id: action.id }] }, action.id);
    case "close":
      return settle({ ...state, windows: state.windows.filter((w) => w.id !== action.id) });
    case "focus":
      return state.windows.some((w) => w.id === action.id) ? show(state, action.id) : state;
    case "maximize": {
      if (!state.windows.some((w) => w.id === action.id)) return state;
      const shown = show(state, action.id);
      return { ...shown, maximizedId: state.maximizedId === action.id ? null : action.id };
    }
    case "unmaximize":
      return { ...state, maximizedId: null };
    case "swap": {
      // Cells follow the column order: swapping two entries swaps their cells.
      const a = state.windows.findIndex((w) => w.id === action.id);
      const b = state.windows.findIndex((w) => w.id === action.with);
      if (a < 0 || b < 0 || a === b) return state;
      const windows = [...state.windows];
      [windows[a], windows[b]] = [windows[b]!, windows[a]!];
      return settle({ ...state, windows, focusedId: action.id });
    }
    case "sync": {
      // Another device changed which sessions are open: ours keep their place,
      // a new one joins the end. It never takes the focus.
      const ids = new Set(action.ids);
      const windows = state.windows.filter((w) => ids.has(w.id));
      for (const id of ids) if (!windows.some((w) => w.id === id)) windows.push({ id });
      return settle({ ...state, windows });
    }
    case "prune":
      return settle({ ...state, windows: state.windows.filter((w) => action.existing.has(w.id)) });
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Anything unexpected in storage gives a valid desk, never an exception.
export function parseDesk(raw: string | null): DeskState {
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return EMPTY_DESK;
  }
  if (!isObject(data)) return EMPTY_DESK;
  const windows: DeskWindow[] = [];
  for (const w of Array.isArray(data.windows) ? data.windows : []) {
    if (!isObject(w) || typeof w.id !== "string" || windows.some((x) => x.id === w.id)) continue;
    windows.push({ id: w.id });
    if (windows.length === DESK_WINDOWS_MAX) break;
  }
  const idOrNull = (v: unknown) => (typeof v === "string" ? v : null);
  return settle({ windows, focusedId: idOrNull(data.focusedId), maximizedId: idOrNull(data.maximizedId) });
}


export function loadDesk(storage: Store | null): DeskState {
  try {
    return parseDesk(storage?.getItem(DESK_KEY) ?? null);
  } catch {
    return EMPTY_DESK;
  }
}

export function saveDesk(storage: Store | null, state: DeskState): void {
  try {
    storage?.setItem(DESK_KEY, JSON.stringify(state));
  } catch {
    // Ignored on purpose: the desk then starts empty on the next load.
  }
}

/** The windows a prune keeps: live threads, and subagent threads, which the shell never lists but the server resolves. */
export async function windowsToKeep(windowIds: readonly string[], liveIds: ReadonlySet<string>, isSubagentThread: (id: string) => Promise<boolean>): Promise<Set<string>> {
  const missing = windowIds.filter((id) => !liveIds.has(id));
  const subagent = await Promise.all(missing.map((id) => isSubagentThread(id).catch(() => false)));
  return new Set([...windowIds.filter((id) => liveIds.has(id)), ...missing.filter((_, i) => subagent[i])]);
}
