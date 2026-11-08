import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  alertMode,
  sessionLinkAction,
  SESSIONS_KEY,
  EMPTY_SESSIONS,
  cellOf,
  sessionsReducer,
  sessionsToKeep,
  loadSessions,
  neighborId,
  parseSessions,
  saveSessions,
  spansRows,
  type SessionsState,
} from "../../../src/features/sessions/sessions.ts";
import { memoryStore } from "../../fixtures.ts";

const open = (s: SessionsState, ...ids: string[]) => ids.reduce((acc, id) => sessionsReducer(acc, { type: "open", id }), s);
const ids = (s: SessionsState) => s.ids;

test("cellOf: columns fill left to right, grid fills each column top then bottom", () => {
  assert.deepEqual([0, 1, 5].map((i) => cellOf(i, "columns")), [{ column: 0, row: 0 }, { column: 1, row: 0 }, { column: 5, row: 0 }]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => cellOf(i, "grid")), [
    { column: 0, row: 0 },
    { column: 0, row: 1 },
    { column: 1, row: 0 },
    { column: 1, row: 1 },
    { column: 2, row: 0 },
  ]);
});

test("in grid view only an odd last session spans both rows", () => {
  assert.equal(spansRows(2, 3, "grid"), true);
  assert.equal(spansRows(1, 3, "grid"), false);
  assert.equal(spansRows(3, 4, "grid"), false);
  assert.equal(spansRows(0, 1, "grid"), false);
  assert.equal(spansRows(2, 3, "columns"), false);
});

test("open adds in order and focuses the new window", () => {
  const s = open(EMPTY_SESSIONS, "a", "b");
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.focusedId, "b");
});

test("open on an open window focuses it without moving it", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "open", id: "a" });
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.focusedId, "a");
});

test("closeAll empties the strip and leaves full screen", () => {
  const s = sessionsReducer(sessionsReducer(open(EMPTY_SESSIONS, "a", "b"), { type: "maximize", id: "b" }), { type: "closeAll" });
  assert.deepEqual(s, EMPTY_SESSIONS);
});

test("close removes the window and moves the focus to the last one", () => {
  let s = open(EMPTY_SESSIONS, "a", "b", "c");
  s = sessionsReducer(s, { type: "close", id: "c" });
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.focusedId, "b");
  s = sessionsReducer(s, { type: "close", id: "a" });
  s = sessionsReducer(s, { type: "close", id: "b" });
  assert.equal(s.focusedId, null);
});

test("closing a window that is not focused keeps the focus", () => {
  let s = open(EMPTY_SESSIONS, "a", "b", "c");
  s = sessionsReducer(s, { type: "focus", id: "a" });
  assert.equal(sessionsReducer(s, { type: "close", id: "c" }).focusedId, "a");
});

test("maximize toggles and focuses", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "maximize", id: "a" });
  assert.equal(s.maximized, true);
  assert.equal(s.focusedId, "a");
  assert.equal(sessionsReducer(s, { type: "maximize", id: "a" }).maximized, false);
});

test("focusing another window leaves the maximized view", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "maximize", id: "a" });
  assert.equal(sessionsReducer(s, { type: "focus", id: "a" }).maximized, true);
  const other = sessionsReducer(s, { type: "focus", id: "b" });
  assert.equal(other.maximized, false);
  assert.equal(other.focusedId, "b");
  assert.deepEqual(sessionsReducer(s, { type: "focus", id: "zz" }), s);
});

test("prune drops ids that no longer exist", () => {
  let s = open(EMPTY_SESSIONS, "a", "b", "c");
  s = sessionsReducer(s, { type: "maximize", id: "c" });
  s = sessionsReducer(s, { type: "prune", existing: new Set(["a", "b"]) });
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.maximized, false);
  assert.equal(s.focusedId, "b");
});

test("sessionsToKeep keeps live threads and subagent threads, drops the rest, even when the server fails", async () => {
  const resolves = async (id: string) => {
    if (id === "boom") throw new Error("404");
    return id === "child";
  };
  const kept = await sessionsToKeep(["live", "child", "archived", "boom"], new Set(["live"]), resolves);
  assert.deepEqual([...kept].sort(), ["child", "live"]);
});

test("parseSessions round-trips and falls back on bad input", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "maximize", id: "b" });
  assert.deepEqual(parseSessions(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(parseSessions(null), EMPTY_SESSIONS);
  assert.deepEqual(parseSessions(42), EMPTY_SESSIONS);
  assert.deepEqual(parseSessions({ ids: "nope", focusedId: 3 }), EMPTY_SESSIONS);
});

test("parseSessions keeps unique window ids in order and drops the rest", () => {
  assert.deepEqual(parseSessions({ ids: ["a", "a", 3, "b"], focusedId: "zz", maximized: true }), { ids: ["a", "b"], focusedId: "b", maximized: false });
  assert.deepEqual(parseSessions({ ids: ["a", "b"], focusedId: "a", maximized: true }), { ids: ["a", "b"], focusedId: "a", maximized: true });
});

test("parseSessions caps the saved ids at 100", () => {
  const saved = Array.from({ length: 130 }, (_, i) => `t${i}`);
  const s = parseSessions({ ids: saved, focusedId: "t120" });
  assert.equal(s.ids.length, 100);
  assert.equal(s.ids.at(-1), "t99");
  assert.equal(s.focusedId, "t99");
});

test("loadSessions and saveSessions use storage", () => {
  const store = memoryStore();
  const s = open(EMPTY_SESSIONS, "a");
  saveSessions(store, s);
  assert.ok(store.data.has(SESSIONS_KEY));
  assert.deepEqual(loadSessions(store), s);
});

test("neighborId in column view moves one column and stops at the ends", () => {
  const s = open(EMPTY_SESSIONS, "a", "b", "c");
  const at = (id: string) => sessionsReducer(s, { type: "focus", id });
  assert.equal(neighborId(at("b"), "right", "columns"), "c");
  assert.equal(neighborId(at("b"), "left", "columns"), "a");
  assert.equal(neighborId(at("c"), "right", "columns"), null);
  assert.equal(neighborId(at("a"), "left", "columns"), null);
  assert.equal(neighborId(at("b"), "up", "columns"), null);
  assert.equal(neighborId(at("b"), "down", "columns"), null);
  assert.equal(neighborId(EMPTY_SESSIONS, "right", "columns"), null);
});

test("neighborId in grid view keeps the row across columns and moves inside a column", () => {
  // Columns: [a b] [c d] [e]
  const s = open(EMPTY_SESSIONS, "a", "b", "c", "d", "e");
  const at = (id: string) => sessionsReducer(s, { type: "focus", id });
  assert.equal(neighborId(at("b"), "right", "grid"), "d");
  assert.equal(neighborId(at("d"), "left", "grid"), "b");
  assert.equal(neighborId(at("a"), "right", "grid"), "c");
  assert.equal(neighborId(at("d"), "right", "grid"), "e", "the last column has no second row: take its first");
  assert.equal(neighborId(at("e"), "left", "grid"), "c");
  assert.equal(neighborId(at("a"), "left", "grid"), null);
  assert.equal(neighborId(at("e"), "right", "grid"), null);
  assert.equal(neighborId(at("a"), "down", "grid"), "b");
  assert.equal(neighborId(at("d"), "up", "grid"), "c");
  assert.equal(neighborId(at("a"), "up", "grid"), null);
  assert.equal(neighborId(at("b"), "down", "grid"), null, "down does not leave the column");
  assert.equal(neighborId(at("c"), "up", "grid"), null, "up does not leave the column");
  assert.equal(neighborId(at("e"), "down", "grid"), null);
});

test("swap exchanges two windows' cells and focuses the dragged one", () => {
  let s = open(EMPTY_SESSIONS, "a", "b", "c");
  s = sessionsReducer(s, { type: "swap", id: "a", with: "c" });
  assert.deepEqual(ids(s), ["c", "b", "a"]);
  assert.equal(s.focusedId, "a");
});

test("swap ignores an unknown or identical window", () => {
  const s = open(EMPTY_SESSIONS, "a", "b");
  assert.equal(sessionsReducer(s, { type: "swap", id: "a", with: "zz" }), s);
  assert.equal(sessionsReducer(s, { type: "swap", id: "a", with: "a" }), s);
});

test("sync keeps the order of the windows this device already has", () => {
  let s = open(EMPTY_SESSIONS, "a", "b", "c");
  s = sessionsReducer(s, { type: "maximize", id: "c" });
  const synced = sessionsReducer(s, { type: "sync", ids: ["c", "b", "a"] });
  assert.deepEqual(synced.ids, s.ids);
  assert.equal(synced.focusedId, "c");
  assert.equal(synced.maximized, true);
});

test("sync drops removed windows and appends new ones without taking the focus", () => {
  let s = open(EMPTY_SESSIONS, "a", "b", "c", "d", "e");
  s = sessionsReducer(s, { type: "focus", id: "b" });
  const synced = sessionsReducer(s, { type: "sync", ids: ["b", "c", "d", "e", "x", "y", "z", "w"] });
  assert.deepEqual(ids(synced), ["b", "c", "d", "e", "x", "y", "z", "w"]);
  assert.equal(synced.focusedId, "b");
});

test("sync moves focus and maximize off a window that is gone", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "maximize", id: "b" });
  const gone = sessionsReducer(s, { type: "sync", ids: ["a"] });
  assert.equal(gone.maximized, false);
  assert.equal(gone.focusedId, "a");
  assert.deepEqual(sessionsReducer(s, { type: "sync", ids: [] }), EMPTY_SESSIONS);
});

test("a session link waits for the saved sessions and the live threads, then opens a known thread", () => {
  const known = new Map([["t1", {}]]);
  assert.equal(sessionLinkAction(null, { loaded: true, live: true }, known), "none");
  assert.equal(sessionLinkAction("t1", { loaded: false, live: true }, known), "wait");
  assert.equal(sessionLinkAction("t1", { loaded: true, live: false }, known), "wait");
  assert.equal(sessionLinkAction("t1", { loaded: true, live: true }, known), "open");
  assert.equal(sessionLinkAction("gone", { loaded: true, live: true }, known), "drop");
});

test("the bell is hidden until alerts are set up, then armed or off per session", () => {
  const armed = new Set(["t1"]);
  assert.equal(alertMode(false, armed, "t1"), null);
  assert.equal(alertMode(true, armed, "t1"), "armed");
  assert.equal(alertMode(true, armed, "t2"), "off");
});
