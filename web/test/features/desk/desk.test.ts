import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  DESK_KEY,
  DESK_LIMIT,
  EMPTY_DESK,
  cellOf,
  deskLayout,
  deskReducer,
  equalSizes,
  gridWindows,
  loadDesk,
  neighborId,
  parseDesk,
  saveDesk,
  sizesFor,
  type DeskState,
} from "../../../src/features/desk/desk.ts";
import { memoryStore } from "../../fixtures.ts";

const open = (s: DeskState, ...ids: string[]) => ids.reduce((acc, id) => deskReducer(acc, { type: "open", id }), s);
const ids = (s: DeskState) => s.windows.map((w) => w.id);

test("deskLayout follows the grid table", () => {
  assert.deepEqual(deskLayout(0), { columns: 0, rows: 0 });
  assert.deepEqual(deskLayout(1), { columns: 1, rows: 1 });
  assert.deepEqual(deskLayout(2), { columns: 2, rows: 1 });
  assert.deepEqual(deskLayout(3), { columns: 3, rows: 1 });
  assert.deepEqual(deskLayout(4), { columns: 2, rows: 2 });
  assert.deepEqual(deskLayout(5), { columns: 3, rows: 2 });
  assert.deepEqual(deskLayout(6), { columns: 3, rows: 2 });
});

test("cellOf fills left to right, then top to bottom", () => {
  assert.deepEqual(cellOf(0, 3), { row: 0, column: 0 });
  assert.deepEqual(cellOf(2, 3), { row: 0, column: 2 });
  assert.deepEqual(cellOf(3, 3), { row: 1, column: 0 });
  assert.deepEqual(cellOf(3, 2), { row: 1, column: 1 });
});

test("equalSizes splits 100 between the tracks", () => {
  assert.deepEqual(equalSizes("c", 2), { c0: 50, c1: 50 });
  assert.deepEqual(equalSizes("r", 1), { r0: 100 });
});

test("open adds in order and focuses the new window", () => {
  const s = open(EMPTY_DESK, "a", "b");
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.focusedId, "b");
});

test("open on an open window focuses it and restores it if minimized", () => {
  let s = open(EMPTY_DESK, "a", "b");
  s = deskReducer(s, { type: "minimize", id: "a" });
  s = deskReducer(s, { type: "open", id: "a" });
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.focusedId, "a");
  assert.equal(s.windows[0]!.minimized, false);
});

test("a seventh visible window minimizes the oldest visible one", () => {
  let s = open(EMPTY_DESK, "a", "b", "c", "d", "e", "f");
  s = deskReducer(s, { type: "maximize", id: "a" });
  s = open(s, "g");
  assert.deepEqual(ids(s), ["a", "b", "c", "d", "e", "f", "g"]);
  assert.deepEqual(s.windows.filter((w) => w.minimized).map((w) => w.id), ["a"]);
  assert.equal(s.focusedId, "g");
  assert.equal(s.maximizedId, null);
});

test("restoring a minimized window keeps six visible", () => {
  let s = open(EMPTY_DESK, "a", "b", "c", "d", "e", "f", "g");
  s = deskReducer(s, { type: "restore", id: "a" });
  assert.equal(gridWindows(s).length, DESK_LIMIT);
  assert.deepEqual(s.windows.filter((w) => w.minimized).map((w) => w.id), ["b"]);
  assert.equal(s.focusedId, "a");
});

test("close removes the window and moves the focus to the last visible one", () => {
  let s = open(EMPTY_DESK, "a", "b", "c");
  s = deskReducer(s, { type: "minimize", id: "b" });
  s = deskReducer(s, { type: "focus", id: "c" });
  s = deskReducer(s, { type: "close", id: "c" });
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.focusedId, "a");
  s = deskReducer(s, { type: "close", id: "a" });
  assert.equal(s.focusedId, null);
});

test("minimize takes the window out of the grid and restore puts it back", () => {
  let s = open(EMPTY_DESK, "a", "b", "c");
  s = deskReducer(s, { type: "maximize", id: "b" });
  s = deskReducer(s, { type: "minimize", id: "b" });
  assert.deepEqual(gridWindows(s).map((w) => w.id), ["a", "c"]);
  assert.equal(s.maximizedId, null);
  assert.equal(s.focusedId, "c");
  s = deskReducer(s, { type: "restore", id: "b" });
  assert.deepEqual(gridWindows(s).map((w) => w.id), ["a", "b", "c"]);
  assert.equal(s.focusedId, "b");
});

test("maximize toggles and focuses; unmaximize restores", () => {
  let s = open(EMPTY_DESK, "a", "b");
  s = deskReducer(s, { type: "maximize", id: "a" });
  assert.equal(s.maximizedId, "a");
  assert.equal(s.focusedId, "a");
  assert.equal(deskReducer(s, { type: "maximize", id: "a" }).maximizedId, null);
  assert.equal(deskReducer(s, { type: "unmaximize" }).maximizedId, null);
});

test("focusing another window leaves the maximized view", () => {
  let s = open(EMPTY_DESK, "a", "b");
  s = deskReducer(s, { type: "maximize", id: "a" });
  assert.equal(deskReducer(s, { type: "focus", id: "a" }).maximizedId, "a");
  const other = deskReducer(s, { type: "focus", id: "b" });
  assert.equal(other.maximizedId, null);
  assert.equal(other.focusedId, "b");
  assert.deepEqual(deskReducer(s, { type: "focus", id: "zz" }), s);
});

test("prune drops ids that no longer exist", () => {
  let s = open(EMPTY_DESK, "a", "b", "c");
  s = deskReducer(s, { type: "maximize", id: "c" });
  s = deskReducer(s, { type: "prune", existing: new Set(["a", "b"]) });
  assert.deepEqual(ids(s), ["a", "b"]);
  assert.equal(s.maximizedId, null);
  assert.equal(s.focusedId, "b");
});

test("setSizes keeps one layout per window count", () => {
  let s = deskReducer(EMPTY_DESK, { type: "setSizes", count: 2, sizes: { columns: { c0: 30, c1: 70 }, rows: { r0: 100 } } });
  s = deskReducer(s, { type: "setSizes", count: 4, sizes: { columns: { c0: 50, c1: 50 }, rows: { r0: 40, r1: 60 } } });
  assert.deepEqual(s.sizes["2"]?.columns, { c0: 30, c1: 70 });
  assert.deepEqual(s.sizes["4"]?.rows, { r0: 40, r1: 60 });
});

test("a change in the visible window count resets the grid to equal tracks", () => {
  let s = open(EMPTY_DESK, "a", "b", "c", "d");
  s = deskReducer(s, { type: "setSizes", count: 4, sizes: { columns: { c0: 50, c1: 50 }, rows: { r0: 60, r1: 40 } } });
  s = deskReducer(s, { type: "focus", id: "a" });
  assert.deepEqual(s.sizes["4"]?.rows, { r0: 60, r1: 40 });
  s = deskReducer(s, { type: "minimize", id: "d" });
  s = deskReducer(s, { type: "restore", id: "d" });
  assert.deepEqual(s.sizes, {});
  assert.deepEqual(sizesFor(s, 4).rows, { r0: 50, r1: 50 });
});

test("parseDesk round-trips and falls back on bad input", () => {
  let s = open(EMPTY_DESK, "a", "b");
  s = deskReducer(s, { type: "minimize", id: "a" });
  s = deskReducer(s, { type: "maximize", id: "b" });
  assert.deepEqual(parseDesk(JSON.stringify(s)), s);
  assert.deepEqual(parseDesk(null), EMPTY_DESK);
  assert.deepEqual(parseDesk("{not json"), EMPTY_DESK);
  assert.deepEqual(parseDesk("42"), EMPTY_DESK);
});

test("parseDesk repairs inconsistent data", () => {
  const raw = JSON.stringify({
    windows: [{ id: "a", minimized: false }, { id: "a", minimized: true }, { id: 3 }, { id: "b", minimized: "yes" }, ...["c", "d", "e", "f", "g", "h"].map((id) => ({ id, minimized: false }))],
    focusedId: "zz",
    maximizedId: "a",
    sizes: { "4": { columns: { c0: 50, c1: 50 }, rows: { r0: 60, r1: 40 } } },
  });
  const s = parseDesk(raw);
  assert.deepEqual(ids(s), ["a", "b", "c", "d", "e", "f"]);
  assert.equal(s.windows[1]!.minimized, false);
  assert.equal(s.focusedId, "f");
  assert.equal(s.maximizedId, "a");
  assert.deepEqual(s.sizes, {});
  const minimizedMax = parseDesk(JSON.stringify({ windows: [{ id: "a", minimized: true }], maximizedId: "a", focusedId: "a" }));
  assert.equal(minimizedMax.maximizedId, null);
  assert.equal(minimizedMax.focusedId, null);
});

test("loadDesk and saveDesk use storage and survive errors", () => {
  const store = memoryStore();
  const s = open(EMPTY_DESK, "a");
  saveDesk(store, s);
  assert.ok(store.data.has(DESK_KEY));
  assert.deepEqual(loadDesk(store), s);
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.deepEqual(loadDesk(broken), EMPTY_DESK);
  assert.doesNotThrow(() => saveDesk(broken, s));
});

test("sizesFor uses saved sizes only when they match the layout", () => {
  const saved = { columns: { c0: 30, c1: 70 }, rows: { r0: 100 } };
  const s = deskReducer(EMPTY_DESK, { type: "setSizes", count: 2, sizes: saved });
  assert.deepEqual(sizesFor(s, 2), saved);
  assert.deepEqual(sizesFor(s, 4), { columns: { c0: 50, c1: 50 }, rows: { r0: 50, r1: 50 } });
  const stale = deskReducer(EMPTY_DESK, { type: "setSizes", count: 2, sizes: { columns: { c0: 100 }, rows: { r0: 100 } } });
  assert.deepEqual(sizesFor(stale, 2).columns, { c0: 50, c1: 50 });
});

test("neighborId wraps left and right and moves by rows up and down", () => {
  const s = open(EMPTY_DESK, "a", "b", "c", "d", "e");
  const at = (id: string) => deskReducer(s, { type: "focus", id });
  assert.equal(neighborId(at("a"), "right"), "b");
  assert.equal(neighborId(at("e"), "right"), "a");
  assert.equal(neighborId(at("a"), "left"), "e");
  assert.equal(neighborId(at("a"), "down"), "d");
  assert.equal(neighborId(at("e"), "up"), "b");
  assert.equal(neighborId(at("c"), "down"), null);
  assert.equal(neighborId(at("a"), "up"), null);
  assert.equal(neighborId(EMPTY_DESK, "right"), null);
});
