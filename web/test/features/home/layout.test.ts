import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LAYOUT,
  HOME_LAYOUT_KEY,
  columnOf,
  isDefaultLayout,
  loadLayout,
  moveCard,
  saveLayout,
  setHidden,
  shiftCard,
  stackedOrder,
  validateLayout,
} from "../../../src/features/home/layout.ts";

test("the default layout has the usage card, Running and Up next on the left and Notifications on the right", () => {
  assert.deepEqual(DEFAULT_LAYOUT, { left: ["usage", "running", "up-next"], right: ["notifications"], hidden: [] });
  assert.equal(isDefaultLayout(validateLayout(null)), true);
});

test("validation drops unknown and repeated ids and appends missing cards to their default column", () => {
  const layout = validateLayout({ left: ["running", "nope", "running", 4], right: ["usage"], hidden: [] });
  assert.deepEqual(layout, { left: ["running", "up-next"], right: ["usage", "notifications"], hidden: [] });
  assert.deepEqual(validateLayout("junk"), DEFAULT_LAYOUT);
  assert.deepEqual(validateLayout({ left: "x", right: null, hidden: ["running"] }).hidden, ["running"]);
});

test("moveCard puts a card at an index of a column, also the other one", () => {
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "up-next", "right", 0), { left: ["usage", "running"], right: ["up-next", "notifications"], hidden: [] });
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "usage", "left", 1).left, ["running", "usage", "up-next"]);
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "usage", "right").right, ["notifications", "usage"]);
});

test("shiftCard moves one step inside the column and stops at the ends", () => {
  assert.deepEqual(shiftCard(DEFAULT_LAYOUT, "running", -1).left, ["running", "usage", "up-next"]);
  assert.deepEqual(shiftCard(DEFAULT_LAYOUT, "running", 1).left, ["usage", "up-next", "running"]);
  assert.equal(shiftCard(DEFAULT_LAYOUT, "usage", -1), DEFAULT_LAYOUT);
  assert.equal(shiftCard(DEFAULT_LAYOUT, "notifications", 1), DEFAULT_LAYOUT);
});

test("a hidden card leaves both columns and comes back to its default column", () => {
  const hidden = setHidden(DEFAULT_LAYOUT, "running", true);
  assert.deepEqual(hidden, { left: ["usage", "up-next"], right: ["notifications"], hidden: ["running"] });
  assert.equal(columnOf(hidden, "running"), null);
  assert.deepEqual(setHidden(hidden, "running", false).left, ["usage", "up-next", "running"]);
  assert.equal(setHidden(DEFAULT_LAYOUT, "running", false), DEFAULT_LAYOUT);
});

test("moving a hidden card shows it", () => {
  const layout = moveCard(setHidden(DEFAULT_LAYOUT, "running", true), "running", "right", 0);
  assert.deepEqual(layout, { left: ["usage", "up-next"], right: ["running", "notifications"], hidden: [] });
});

test("on a phone the usage card leads, then the right column, then the rest", () => {
  assert.deepEqual(stackedOrder(DEFAULT_LAYOUT), ["usage", "notifications", "running", "up-next"]);
});

test("the layout is saved and loaded, and a broken value gives the default", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const moved = moveCard(DEFAULT_LAYOUT, "running", "right");
  saveLayout(storage, moved);
  assert.deepEqual(loadLayout(storage), moved);
  store.set(HOME_LAYOUT_KEY, "{not json");
  assert.deepEqual(loadLayout(storage), DEFAULT_LAYOUT);
  assert.deepEqual(loadLayout(null), DEFAULT_LAYOUT);
});
