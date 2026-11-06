import { SESSIONS_MAX } from "../../../../shared/sessions.ts";
import type { SessionLayout } from "../../lib/sessionLayout.ts";
import { readKey, writeKey, type Store } from "../../lib/storage.ts";

export const SESSIONS_KEY = "t3-dashboard-sessions";

export interface SessionsState {
  // Column order, left to right: the first id is the oldest unless a swap moved it.
  ids: string[];
  focusedId: string | null;
  // Only the focused session can fill the strip.
  maximized: boolean;
}

export type SessionsAction =
  | { type: "open"; id: string }
  | { type: "close"; id: string }
  | { type: "closeAll" }
  | { type: "focus"; id: string }
  | { type: "maximize"; id: string }
  | { type: "swap"; id: string; with: string }
  | { type: "sync"; ids: readonly string[] }
  | { type: "prune"; existing: ReadonlySet<string> };

export const EMPTY_SESSIONS: SessionsState = { ids: [], focusedId: null, maximized: false };

/** Below this width the strip becomes one window with a tab bar. */
export const NARROW_STRIP = "(max-width: 899px)";

/** Sessions stacked in one column: grid view stacks two. */
export const perColumn = (layout: SessionLayout): number => (layout === "grid" ? 2 : 1);

export function cellOf(index: number, layout: SessionLayout): { column: number; row: number } {
  const p = perColumn(layout);
  return { column: Math.floor(index / p), row: index % p };
}

/** In grid view an odd last session has its column to itself and takes both rows. */
export const spansRows = (index: number, count: number, layout: SessionLayout): boolean => layout === "grid" && count > 1 && count % 2 === 1 && index === count - 1;

export type Direction = "left" | "right" | "up" | "down";

/** The session next to the focused one in a direction; the strip does not wrap. */
export function neighborId({ ids, focusedId }: SessionsState, direction: Direction, layout: SessionLayout): string | null {
  if (!focusedId) return null;
  const p = perColumn(layout);
  const from = ids.indexOf(focusedId);
  if (direction === "up" || direction === "down") {
    const target = from + (direction === "down" ? 1 : -1);
    return Math.floor(target / p) === Math.floor(from / p) ? (ids[target] ?? null) : null;
  }
  const target = from + (direction === "right" ? p : -p);
  // The last column can be shorter: fall back to its first session.
  return target < 0 ? null : (ids[target] ?? ids[Math.floor(target / p) * p] ?? null);
}

// Keeps the invariants: focus points at an open session, and only that session can be maximized.
function settle(state: SessionsState): SessionsState {
  const focusedId = state.focusedId !== null && state.ids.includes(state.focusedId) ? state.focusedId : (state.ids.at(-1) ?? null);
  return { ...state, focusedId, maximized: state.maximized && focusedId !== null && focusedId === state.focusedId };
}

function show(state: SessionsState, id: string): SessionsState {
  return settle({ ...state, focusedId: id, maximized: state.maximized && state.focusedId === id });
}

export function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
  switch (action.type) {
    case "open":
      return show(state.ids.includes(action.id) ? state : { ...state, ids: [...state.ids, action.id] }, action.id);
    case "close":
      return settle({ ...state, ids: state.ids.filter((id) => id !== action.id) });
    case "closeAll":
      return EMPTY_SESSIONS;
    case "focus":
      return state.ids.includes(action.id) ? show(state, action.id) : state;
    case "maximize":
      return state.ids.includes(action.id) ? { ...state, focusedId: action.id, maximized: !(state.maximized && state.focusedId === action.id) } : state;
    case "swap": {
      // Cells follow the column order: swapping two entries swaps their cells.
      const a = state.ids.indexOf(action.id);
      const b = state.ids.indexOf(action.with);
      if (a < 0 || b < 0 || a === b) return state;
      const ids = [...state.ids];
      [ids[a], ids[b]] = [ids[b]!, ids[a]!];
      return settle({ ...state, ids, focusedId: action.id });
    }
    case "sync": {
      // Another device changed which sessions are open: ours keep their place,
      // a new one joins the end. It never takes the focus.
      const wanted = new Set(action.ids);
      return settle({ ...state, ids: [...state.ids.filter((id) => wanted.has(id)), ...[...wanted].filter((id) => !state.ids.includes(id))] });
    }
    case "prune":
      return settle({ ...state, ids: state.ids.filter((id) => action.existing.has(id)) });
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Anything unexpected in storage gives a valid sessions, never an exception.
export function parseSessions(raw: string | null): SessionsState {
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return EMPTY_SESSIONS;
  }
  if (!isObject(data)) return EMPTY_SESSIONS;
  const ids = (Array.isArray(data.ids) ? data.ids : []).filter((id, i, all): id is string => typeof id === "string" && all.indexOf(id) === i).slice(0, SESSIONS_MAX);
  return settle({ ids, focusedId: typeof data.focusedId === "string" ? data.focusedId : null, maximized: data.maximized === true });
}

export const loadSessions = (storage: Store | null): SessionsState => parseSessions(readKey(storage, SESSIONS_KEY));

export const saveSessions = (storage: Store | null, state: SessionsState): void => writeKey(storage, SESSIONS_KEY, JSON.stringify(state));

/** The sessions a prune keeps: live threads, and subagent threads, which the shell never lists but the server resolves. */
export async function sessionsToKeep(sessionIds: readonly string[], liveIds: ReadonlySet<string>, isSubagentThread: (id: string) => Promise<boolean>): Promise<Set<string>> {
  const missing = sessionIds.filter((id) => !liveIds.has(id));
  const subagent = await Promise.all(missing.map((id) => isSubagentThread(id).catch(() => false)));
  return new Set([...sessionIds.filter((id) => liveIds.has(id)), ...missing.filter((_, i) => subagent[i])]);
}
