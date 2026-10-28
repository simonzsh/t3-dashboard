import { DESK_LIMIT, DESK_WINDOWS_MAX } from "../../../../shared/desk.ts";
import type { Store } from "../../lib/storage.ts";

export { DESK_LIMIT };
export const DESK_KEY = "t3-dashboard-desk";

export type TrackSizes = Record<string, number>;

export interface DeskSizes {
  columns: TrackSizes;
  rows: TrackSizes;
}

export interface DeskWindow {
  id: string;
  minimized: boolean;
}

export interface DeskState {
  // Opening order: the first window is the oldest.
  windows: DeskWindow[];
  focusedId: string | null;
  maximizedId: string | null;
  // Grid sizes per layout, keyed by the number of windows in the grid.
  sizes: Record<string, DeskSizes>;
}

export type DeskAction =
  | { type: "open"; id: string }
  | { type: "close"; id: string }
  | { type: "focus"; id: string }
  | { type: "minimize"; id: string }
  | { type: "restore"; id: string }
  | { type: "maximize"; id: string }
  | { type: "unmaximize" }
  | { type: "swap"; id: string; with: string }
  | { type: "sync"; ids: readonly string[] }
  | { type: "prune"; existing: ReadonlySet<string> }
  | { type: "setSizes"; count: number; sizes: DeskSizes };

export const EMPTY_DESK: DeskState = { windows: [], focusedId: null, maximizedId: null, sizes: {} };

export function deskLayout(count: number): { columns: number; rows: number } {
  if (count <= 0) return { columns: 0, rows: 0 };
  if (count <= 3) return { columns: count, rows: 1 };
  if (count === 4) return { columns: 2, rows: 2 };
  return { columns: 3, rows: 2 };
}

export function cellOf(index: number, columns: number): { row: number; column: number } {
  return { row: Math.floor(index / columns), column: index % columns };
}

export type Direction = "left" | "right" | "up" | "down";

/** The window next to the focused one in a direction; left and right wrap, up and down stay in their column. */
export function neighborId(state: DeskState, direction: Direction): string | null {
  const grid = gridWindows(state);
  const from = grid.findIndex((w) => w.id === state.focusedId);
  if (grid.length === 0) return null;
  if (from < 0) return grid[0]!.id;
  if (direction === "left" || direction === "right") return grid[(from + (direction === "right" ? 1 : grid.length - 1)) % grid.length]!.id;
  const { columns } = deskLayout(grid.length);
  const target = from + (direction === "down" ? columns : -columns);
  return grid[target]?.id ?? null;
}

/** The window `step` places after `id` in opening order (negative: before), or null past either end. */
export function stepId(windows: readonly DeskWindow[], id: string, step: 1 | -1): string | null {
  const at = windows.findIndex((w) => w.id === id);
  return at < 0 ? null : (windows[at + step]?.id ?? null);
}

export function equalSizes(prefix: string, count: number): TrackSizes {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, 100 / count]));
}

function matches(sizes: TrackSizes | undefined, prefix: string, count: number): sizes is TrackSizes {
  const keys = Object.keys(sizes ?? {});
  return keys.length === count && keys.every((k) => k.startsWith(prefix) && Number(k.slice(prefix.length)) < count);
}

// Saved sizes for this window count, or equal tracks when none fit the current grid.
export function sizesFor(state: DeskState, count: number): DeskSizes {
  const { columns, rows } = deskLayout(count);
  const saved = state.sizes[String(count)];
  return {
    columns: matches(saved?.columns, "c", columns) ? saved.columns : equalSizes("c", columns),
    rows: matches(saved?.rows, "r", rows) ? saved.rows : equalSizes("r", rows),
  };
}

export function gridWindows(state: DeskState): DeskWindow[] {
  return state.windows.filter((w) => !w.minimized);
}

// Keeps the invariants: focus and maximize point at visible windows.
function settle(state: DeskState): DeskState {
  const visible = gridWindows(state);
  const isVisible = (id: string | null) => id !== null && visible.some((w) => w.id === id);
  const maximizedId = isVisible(state.maximizedId) ? state.maximizedId : null;
  const focusedId = isVisible(state.focusedId) ? state.focusedId : (visible.at(-1)?.id ?? null);
  return { ...state, maximizedId, focusedId };
}

// A seventh visible window minimizes the oldest visible one, never the window being shown.
function capVisible(windows: DeskWindow[], keepId: string): DeskWindow[] {
  let extra = windows.filter((w) => !w.minimized).length - DESK_LIMIT;
  return windows.map((w) => {
    if (extra <= 0 || w.minimized || w.id === keepId) return w;
    extra--;
    return { ...w, minimized: true };
  });
}

function show(state: DeskState, id: string): DeskState {
  const windows = capVisible(state.windows.map((w) => (w.id === id ? { ...w, minimized: false } : w)), id);
  const maximizedId = state.maximizedId === id ? id : null;
  return settle({ ...state, windows, focusedId: id, maximizedId });
}

// A new window count starts with equal tracks: a drag only holds for the layout it was made in.
export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  const next = reduce(state, action);
  return gridWindows(next).length === gridWindows(state).length ? next : { ...next, sizes: {} };
}

function reduce(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case "open":
      if (state.windows.some((w) => w.id === action.id)) return show(state, action.id);
      return show({ ...state, windows: [...state.windows, { id: action.id, minimized: false }] }, action.id);
    case "close":
      return settle({ ...state, windows: state.windows.filter((w) => w.id !== action.id) });
    case "focus":
    case "restore":
      return state.windows.some((w) => w.id === action.id) ? show(state, action.id) : state;
    case "minimize":
      return settle({
        ...state,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, minimized: true } : w)),
        focusedId: state.focusedId === action.id ? null : state.focusedId,
      });
    case "maximize": {
      if (!state.windows.some((w) => w.id === action.id)) return state;
      const shown = show(state, action.id);
      return { ...shown, maximizedId: state.maximizedId === action.id ? null : action.id };
    }
    case "unmaximize":
      return { ...state, maximizedId: null };
    case "swap": {
      // Grid cells follow the opening order: swapping two entries swaps their cells.
      const a = state.windows.findIndex((w) => w.id === action.id);
      const b = state.windows.findIndex((w) => w.id === action.with);
      if (a < 0 || b < 0 || a === b) return state;
      const windows = [...state.windows];
      [windows[a], windows[b]] = [windows[b]!, windows[a]!];
      return settle({ ...state, windows, focusedId: action.id });
    }
    case "sync": {
      // Another device changed which windows are on the Desk: ours keep their place and state,
      // a new one joins the grid if there is room, else the dock. It never takes the focus.
      const ids = new Set(action.ids);
      const windows = state.windows.filter((w) => ids.has(w.id));
      let visible = windows.filter((w) => !w.minimized).length;
      for (const id of ids) {
        if (windows.some((w) => w.id === id)) continue;
        windows.push({ id, minimized: visible >= DESK_LIMIT });
        visible++;
      }
      return settle({ ...state, windows });
    }
    case "prune":
      return settle({ ...state, windows: state.windows.filter((w) => action.existing.has(w.id)) });
    case "setSizes":
      return { ...state, sizes: { ...state.sizes, [String(action.count)]: action.sizes } };
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
  let visible = 0;
  for (const w of Array.isArray(data.windows) ? data.windows : []) {
    if (!isObject(w) || typeof w.id !== "string" || windows.some((x) => x.id === w.id)) continue;
    // A visible window past the grid limit goes to the dock.
    const shown = w.minimized !== true && visible < DESK_LIMIT;
    if (shown) visible++;
    windows.push({ id: w.id, minimized: !shown });
    if (windows.length === DESK_WINDOWS_MAX) break;
  }
  const idOrNull = (v: unknown) => (typeof v === "string" ? v : null);
  return settle({ windows, focusedId: idOrNull(data.focusedId), maximizedId: idOrNull(data.maximizedId), sizes: {} });
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
    // Sizes stay in memory: a drag from an old session must not shape the grid on the next load.
    storage?.setItem(DESK_KEY, JSON.stringify({ ...state, sizes: {} }));
  } catch {
    // Ignored on purpose: the desk then starts empty on the next load.
  }
}
