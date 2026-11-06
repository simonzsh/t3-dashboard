import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  CARD_TITLES,
  DEFAULT_LAYOUT,
  DASHBOARD_LAYOUT_KEY,
  isDefaultLayout,
  loadLayout,
  dropCard,
  moveCard,
  saveLayout,
  setHidden,
  shiftCard,
  stackedOrder,
  validateLayout,
} from "../../../src/features/dashboard/layout.ts";
import { memoryStore } from "../../fixtures.ts";

test("the default layout has Usage, Activity, Running and Up next on the left and Notifications on the right", () => {
  assert.deepEqual(DEFAULT_LAYOUT, { left: ["usage", "activity", "running", "up-next"], right: ["notifications"], hidden: [] });
  assert.equal(isDefaultLayout(validateLayout(null)), true);
});

test("validation drops unknown and repeated ids and appends missing cards to their default column", () => {
  const layout = validateLayout({ left: ["running", "nope", "running", 4], right: ["usage"], hidden: [] });
  assert.deepEqual(layout, { left: ["running", "activity", "up-next"], right: ["usage", "notifications"], hidden: [] });
  assert.deepEqual(validateLayout("junk"), DEFAULT_LAYOUT);
  assert.deepEqual(validateLayout({ left: "x", right: null, hidden: ["running"] }).hidden, ["running"]);
});

test("moveCard puts a card at an index of a column, also the other one", () => {
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "up-next", "right", 0), { left: ["usage", "activity", "running"], right: ["up-next", "notifications"], hidden: [] });
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "usage", "left", 1).left, ["activity", "usage", "running", "up-next"]);
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "usage", "right").right, ["notifications", "usage"]);
});

test("shiftCard moves one step inside the column and stops at the ends", () => {
  assert.deepEqual(shiftCard(DEFAULT_LAYOUT, "running", -1).left, ["usage", "running", "activity", "up-next"]);
  assert.deepEqual(shiftCard(DEFAULT_LAYOUT, "running", 1).left, ["usage", "activity", "up-next", "running"]);
  assert.equal(shiftCard(DEFAULT_LAYOUT, "usage", -1), DEFAULT_LAYOUT);
  assert.equal(shiftCard(DEFAULT_LAYOUT, "notifications", 1), DEFAULT_LAYOUT);
});

test("a hidden card leaves both columns and comes back to its default column", () => {
  const hidden = setHidden(DEFAULT_LAYOUT, "running", true);
  assert.deepEqual(hidden, { left: ["usage", "activity", "up-next"], right: ["notifications"], hidden: ["running"] });
  assert.equal(shiftCard(hidden, "running", 1), hidden);
  assert.deepEqual(setHidden(hidden, "running", false).left, ["usage", "activity", "up-next", "running"]);
  assert.equal(setHidden(DEFAULT_LAYOUT, "running", false), DEFAULT_LAYOUT);
});

test("a layout stored before the Activity card gets Activity at the end of the left column", () => {
  const stored = { left: ["usage", "running", "up-next"], right: ["notifications"], hidden: [] };
  assert.deepEqual(validateLayout(stored), { left: ["usage", "running", "up-next", "activity"], right: ["notifications"], hidden: [] });
});

test("the cards have their titles", () => {
  assert.deepEqual([CARD_TITLES.usage, CARD_TITLES.activity], ["Usage", "Activity"]);
});

test("moving a hidden card shows it", () => {
  const layout = moveCard(setHidden(DEFAULT_LAYOUT, "running", true), "running", "right", 0);
  assert.deepEqual(layout, { left: ["usage", "activity", "up-next"], right: ["running", "notifications"], hidden: [] });
});

test("on a phone Usage leads, then the right column, then the rest", () => {
  assert.deepEqual(stackedOrder(DEFAULT_LAYOUT), ["usage", "notifications", "activity", "running", "up-next"]);
});

test("the layout is saved and loaded, and a broken value gives the default", () => {
  const storage = memoryStore();
  const moved = moveCard(DEFAULT_LAYOUT, "running", "right");
  saveLayout(storage, moved);
  assert.deepEqual(loadLayout(storage), moved);
  storage.data.set(DASHBOARD_LAYOUT_KEY, "{not json");
  assert.deepEqual(loadLayout(storage), DEFAULT_LAYOUT);
  assert.deepEqual(loadLayout(null), DEFAULT_LAYOUT);
});

test("dropCard lands before the target slot, and changes nothing next to the card", () => {
  // Default left column: usage, activity, running, up-next.
  assert.deepEqual(dropCard(DEFAULT_LAYOUT, "usage", "left", 2).left, ["activity", "usage", "running", "up-next"]);
  assert.deepEqual(dropCard(DEFAULT_LAYOUT, "usage", "left", 4).left, ["activity", "running", "up-next", "usage"]);
  assert.deepEqual(dropCard(DEFAULT_LAYOUT, "up-next", "left", 0).left, ["up-next", "usage", "activity", "running"]);
  assert.deepEqual(dropCard(DEFAULT_LAYOUT, "running", "right", 1).right, ["notifications", "running"]);
  assert.equal(dropCard(DEFAULT_LAYOUT, "running", "left", 2), DEFAULT_LAYOUT);
  assert.equal(dropCard(DEFAULT_LAYOUT, "running", "left", 3), DEFAULT_LAYOUT);
});
