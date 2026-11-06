import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  CARD_TITLES,
  DEFAULT_LAYOUT,
  DASHBOARD_LAYOUT_KEY,
  dropCard,
  isDefaultLayout,
  loadLayout,
  moveCard,
  saveLayout,
  setHidden,
  shiftCard,
  validateLayout,
} from "../../../src/features/dashboard/layout.ts";
import { memoryStore } from "../../fixtures.ts";

test("the default layout is one list of the five cards, none hidden", () => {
  assert.deepEqual(DEFAULT_LAYOUT, { order: ["usage", "activity", "server", "running", "up-next"], hidden: [] });
  assert.equal(isDefaultLayout(validateLayout(null)), true);
});

test("the cards have their titles, and Notifications is not a card", () => {
  assert.deepEqual([CARD_TITLES.usage, CARD_TITLES.server, CARD_TITLES.activity, CARD_TITLES.running, CARD_TITLES["up-next"]], ["Usage", "Server", "Activity", "Running", "Up next"]);
  assert.equal("notifications" in CARD_TITLES, false);
});

test("an unreadable or old-shaped layout gives the default", () => {
  assert.deepEqual(validateLayout("junk"), DEFAULT_LAYOUT);
  assert.deepEqual(validateLayout({ left: ["running"], right: ["usage"], hidden: [] }), DEFAULT_LAYOUT);
  assert.deepEqual(validateLayout({ order: "x", hidden: ["running"] }), DEFAULT_LAYOUT);
});

test("validation drops unknown ids, keeps each card once and appends the missing ones", () => {
  const layout = validateLayout({ order: ["running", "notifications", "nope", "running", 4], hidden: ["server", "usage", "usage"] });
  assert.deepEqual(layout, { order: ["running", "activity", "up-next"], hidden: ["server", "usage"] });
});

test("a card in the order wins over the same card in hidden, and a non-array hidden is empty", () => {
  assert.deepEqual(validateLayout({ order: ["usage"], hidden: ["usage", "server"] }), { order: ["usage", "activity", "running", "up-next"], hidden: ["server"] });
  assert.deepEqual(validateLayout({ order: ["usage", "activity", "server", "running", "up-next"], hidden: "x" }).hidden, []);
});

test("moveCard puts a card at an index, or at the end", () => {
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "usage", 1).order, ["activity", "usage", "server", "running", "up-next"]);
  assert.deepEqual(moveCard(DEFAULT_LAYOUT, "usage").order, ["activity", "server", "running", "up-next", "usage"]);
});

test("moving a hidden card shows it", () => {
  const layout = moveCard(setHidden(DEFAULT_LAYOUT, "running", true), "running", 0);
  assert.deepEqual(layout, { order: ["running", "usage", "activity", "server", "up-next"], hidden: [] });
});

test("shiftCard moves one step and stops at the ends and for a hidden card", () => {
  assert.deepEqual(shiftCard(DEFAULT_LAYOUT, "running", -1).order, ["usage", "activity", "running", "server", "up-next"]);
  assert.deepEqual(shiftCard(DEFAULT_LAYOUT, "running", 1).order, ["usage", "activity", "server", "up-next", "running"]);
  assert.equal(shiftCard(DEFAULT_LAYOUT, "usage", -1), DEFAULT_LAYOUT);
  assert.equal(shiftCard(DEFAULT_LAYOUT, "up-next", 1), DEFAULT_LAYOUT);
  const hidden = setHidden(DEFAULT_LAYOUT, "running", true);
  assert.equal(shiftCard(hidden, "running", 1), hidden);
});

test("a hidden card leaves the order, and showing it appends it to the end", () => {
  const hidden = setHidden(DEFAULT_LAYOUT, "running", true);
  assert.deepEqual(hidden, { order: ["usage", "activity", "server", "up-next"], hidden: ["running"] });
  assert.deepEqual(setHidden(hidden, "running", false), { order: ["usage", "activity", "server", "up-next", "running"], hidden: [] });
  assert.equal(setHidden(DEFAULT_LAYOUT, "running", false), DEFAULT_LAYOUT);
});

test("dropCard lands before the target slot, and changes nothing next to the card", () => {
  assert.deepEqual(dropCard(DEFAULT_LAYOUT, "usage", 2).order, ["activity", "usage", "server", "running", "up-next"]);
  assert.deepEqual(dropCard(DEFAULT_LAYOUT, "usage", 5).order, ["activity", "server", "running", "up-next", "usage"]);
  assert.deepEqual(dropCard(DEFAULT_LAYOUT, "up-next", 0).order, ["up-next", "usage", "activity", "server", "running"]);
  assert.equal(dropCard(DEFAULT_LAYOUT, "running", 3), DEFAULT_LAYOUT);
  assert.equal(dropCard(DEFAULT_LAYOUT, "running", 4), DEFAULT_LAYOUT);
});

test("the layout is saved and loaded, and a broken value gives the default", () => {
  const storage = memoryStore();
  const moved = moveCard(DEFAULT_LAYOUT, "running");
  saveLayout(storage, moved);
  assert.deepEqual(loadLayout(storage), moved);
  storage.data.set(DASHBOARD_LAYOUT_KEY, "{not json");
  assert.deepEqual(loadLayout(storage), DEFAULT_LAYOUT);
  assert.deepEqual(loadLayout(null), DEFAULT_LAYOUT);
});
