import type { Store } from "../../lib/storage.ts";

/** Windows shown in the grid at once; the others wait minimized in the dock. */
export const DESK_LIMIT = 6;
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

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
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
    case "prune":
      return settle({ ...state, windows: state.windows.filter((w) => action.existing.has(w.id)) });
    case "setSizes":
      return { ...state, sizes: { ...state.sizes, [String(action.count)]: action.sizes } };
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseTracks(raw: unknown): TrackSizes {
  if (!isObject(raw)) return {};
  const out: TrackSizes = {};
  for (const [id, v] of Object.entries(raw)) if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[id] = v;
  return out;
}

function parseSizes(raw: unknown): Record<string, DeskSizes> {
  if (!isObject(raw)) return {};
  const out: Record<string, DeskSizes> = {};
  for (const [count, value] of Object.entries(raw)) {
    if (isObject(value)) out[count] = { columns: parseTracks(value.columns), rows: parseTracks(value.rows) };
  }
  return out;
}

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
    windows.push({ id: w.id, minimized: w.minimized === true });
    if (windows.length === DESK_LIMIT) break;
  }
  const idOrNull = (v: unknown) => (typeof v === "string" ? v : null);
  return settle({ windows, focusedId: idOrNull(data.focusedId), maximizedId: idOrNull(data.maximizedId), sizes: parseSizes(data.sizes) });
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
