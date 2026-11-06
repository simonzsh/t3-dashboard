import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  SESSIONS_KEY,
  EMPTY_SESSIONS,
  cellOf,
  columnLeadId,
  sessionsReducer,
  windowsToKeep,
  loadSessions,
  neighborId,
  parseSessions,
  saveSessions,
  spansRows,
  stepId,
  stripLayout,
  type SessionsState,
} from "../../../src/features/sessions/sessions.ts";
import { memoryStore } from "../../fixtures.ts";

const open = (s: SessionsState, ...ids: string[]) => ids.reduce((acc, id) => sessionsReducer(acc, { type: "open", id }), s);
const ids = (s: SessionsState) => s.windows.map((w) => w.id);

test("stripLayout: one row of columns, or two rows of stacked sessions", () => {
  assert.deepEqual(stripLayout(0, "columns"), { columns: 0, rows: 0 });
  assert.deepEqual(stripLayout(0, "grid"), { columns: 0, rows: 0 });
  assert.deepEqual(stripLayout(1, "columns"), { columns: 1, rows: 1 });
  assert.deepEqual(stripLayout(7, "columns"), { columns: 7, rows: 1 });
  assert.deepEqual(stripLayout(1, "grid"), { columns: 1, rows: 1 });
  assert.deepEqual(stripLayout(2, "grid"), { columns: 1, rows: 2 });
  assert.deepEqual(stripLayout(3, "grid"), { columns: 2, rows: 2 });
  assert.deepEqual(stripLayout(7, "grid"), { columns: 4, rows: 2 });
});

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

test("sessions are never capped by the number visible: the last one opened keeps the focus", () => {
  const all = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  let s = open(EMPTY_SESSIONS, ...all);
  s = sessionsReducer(s, { type: "maximize", id: "a" });
  s = open(s, "j");
  assert.deepEqual(ids(s), [...all, "j"]);
  assert.equal(s.focusedId, "j");
  assert.equal(s.maximizedId, null);
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

test("maximize toggles and focuses; unmaximize restores", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "maximize", id: "a" });
  assert.equal(s.maximizedId, "a");
  assert.equal(s.focusedId, "a");
  assert.equal(sessionsReducer(s, { type: "maximize", id: "a" }).maximizedId, null);
  assert.equal(sessionsReducer(s, { type: "unmaximize" }).maximizedId, null);
});

test("focusing another window leaves the maximized view", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "maximize", id: "a" });
  assert.equal(sessionsReducer(s, { type: "focus", id: "a" }).maximizedId, "a");
  const other = sessionsReducer(s, { type: "focus", id: "b" });
  assert.equal(other.maximizedId, null);
  assert.equal(other.focusedId, "b");
  assert.deepEqual(sessionsReducer(s, { type: "focus", id: "zz" }), s);
});

test("prune drops ids that no longer exist", () => {
  let s = open(EMPTY_SESSIONS, "a", "b", "c");
  s = sessionsReducer(s, { type: "maximize", id: "c" });
  s = sessionsReducer(s, { type: "prune", existing: new Set(["a", "b"]) });
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.maximizedId, null);
  assert.equal(s.focusedId, "b");
});

test("windowsToKeep keeps live threads and subagent threads, drops the rest, even when the server fails", async () => {
  const resolves = async (id: string) => {
    if (id === "boom") throw new Error("404");
    return id === "child";
  };
  const kept = await windowsToKeep(["live", "child", "archived", "boom"], new Set(["live"]), resolves);
  assert.deepEqual([...kept].sort(), ["child", "live"]);
});

test("parseSessions round-trips and falls back on bad input", () => {
  let s = open(EMPTY_SESSIONS, "a", "b");
  s = sessionsReducer(s, { type: "maximize", id: "b" });
  assert.deepEqual(parseSessions(JSON.stringify(s)), s);
  assert.deepEqual(parseSessions(null), EMPTY_SESSIONS);
  assert.deepEqual(parseSessions("{not json"), EMPTY_SESSIONS);
  assert.deepEqual(parseSessions("42"), EMPTY_SESSIONS);
  assert.deepEqual(parseSessions(JSON.stringify({ windows: "nope", focusedId: 3 })), EMPTY_SESSIONS);
});

test("parseSessions keeps unique window ids in order and drops the rest", () => {
  const raw = JSON.stringify({ windows: [{ id: "a" }, { id: "a" }, { id: 3 }, "x", { id: "b" }], focusedId: "zz", maximizedId: "b" });
  assert.deepEqual(parseSessions(raw), { windows: [{ id: "a" }, { id: "b" }], focusedId: "b", maximizedId: "b" });
});

test("parseSessions caps the saved windows at 100", () => {
  const windows = Array.from({ length: 130 }, (_, i) => ({ id: `t${i}` }));
  const s = parseSessions(JSON.stringify({ windows, focusedId: "t120" }));
  assert.equal(s.windows.length, 100);
  assert.equal(s.windows.at(-1)!.id, "t99");
  assert.equal(s.focusedId, "t99");
});

test("loadSessions and saveSessions use storage and survive errors", () => {
  const store = memoryStore();
  const s = open(EMPTY_SESSIONS, "a");
  saveSessions(store, s);
  assert.ok(store.data.has(SESSIONS_KEY));
  assert.deepEqual(loadSessions(store), s);
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.deepEqual(loadSessions(broken), EMPTY_SESSIONS);
  assert.doesNotThrow(() => saveSessions(broken, s));
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

test("neighborId without a focused window gives the first session", () => {
  const s = { ...open(EMPTY_SESSIONS, "a", "b"), focusedId: null };
  assert.equal(neighborId(s, "right", "columns"), "a");
  assert.equal(neighborId(s, "down", "grid"), "a");
});

test("columnLeadId is the first session of the n-th column, or null past the last", () => {
  const s = open(EMPTY_SESSIONS, "a", "b", "c", "d", "e");
  assert.deepEqual([1, 2, 5, 6].map((n) => columnLeadId(s, n, "columns")), ["a", "b", "e", null]);
  assert.deepEqual([1, 2, 3, 4].map((n) => columnLeadId(s, n, "grid")), ["a", "c", "e", null]);
  assert.equal(columnLeadId(EMPTY_SESSIONS, 1, "columns"), null);
});

test("stepId moves along the opening order and stops at both ends", () => {
  const s = open(EMPTY_SESSIONS, "a", "b", "c");
  assert.equal(stepId(s.windows, "b", 1), "c");
  assert.equal(stepId(s.windows, "b", -1), "a");
  assert.equal(stepId(s.windows, "c", 1), null);
  assert.equal(stepId(s.windows, "a", -1), null);
  assert.equal(stepId(s.windows, "x", 1), null);
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
  assert.deepEqual(synced.windows, s.windows);
  assert.equal(synced.focusedId, "c");
  assert.equal(synced.maximizedId, "c");
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
  assert.equal(gone.maximizedId, null);
  assert.equal(gone.focusedId, "a");
  assert.deepEqual(sessionsReducer(s, { type: "sync", ids: [] }), EMPTY_SESSIONS);
});
