import assert from "node:assert/strict";
import { test } from "bun:test";
import { filterOptions, moveActive, placeMenu, projectOptions, showsFilter } from "../../src/lib/dropdown.ts";

const options = [
  { id: "a", label: "Alpha", group: "First" },
  { id: "b", label: "Beta", description: "Second letter" },
  { id: "c", label: "Gamma", group: "Greek" },
];

test("the filter keeps options whose label or group holds the text, case aside", () => {
  assert.deepEqual(filterOptions(options, "ET").map((o) => o.id), ["b"]);
  assert.deepEqual(filterOptions(options, "greek").map((o) => o.id), ["c"]);
  assert.deepEqual(filterOptions(options, " a ").map((o) => o.id), ["a", "b", "c"]);
  assert.deepEqual(filterOptions(options, "").map((o) => o.id), ["a", "b", "c"]);
  assert.deepEqual(filterOptions(options, "zeta"), []);
});

test("arrows move the active option and wrap around", () => {
  assert.equal(moveActive(3, 0, 1), 1);
  assert.equal(moveActive(3, 2, 1), 0);
  assert.equal(moveActive(3, 0, -1), 2);
  assert.equal(moveActive(3, -1, 1), 0);
  assert.equal(moveActive(3, -1, -1), 2);
  assert.equal(moveActive(0, -1, 1), -1);
});

test("the filter field shows for long lists or on request", () => {
  assert.equal(showsFilter(3, undefined), false);
  assert.equal(showsFilter(9, undefined), true);
  assert.equal(showsFilter(3, true), true);
  assert.equal(showsFilter(20, false), false);
});

test("projects become options sorted by title", () => {
  const projects = [
    { id: "p2", title: "beta", defaultModelSelection: null, icon: null },
    { id: "p1", title: "Alpha", defaultModelSelection: null, icon: null },
  ];
  assert.deepEqual(projectOptions(projects), [
    { id: "p1", label: "Alpha" },
    { id: "p2", label: "beta" },
  ]);
});

const view = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };
const place = (anchor: { left: number; top: number; width: number; height: number }, size = menu, o = {}) =>
  placeMenu(anchor, size, view, { align: "start", minWidth: 0, matchWidth: false, ...o });

test("the menu opens below its trigger when it fits", () => {
  const p = place({ left: 100, top: 100, width: 80, height: 30 });
  assert.deepEqual(p, { left: 100, top: 134, minWidth: 0, above: false });
});

test("the menu flips above when there is no room below", () => {
  const p = place({ left: 100, top: 700, width: 80, height: 30 });
  assert.equal(p.above, true);
  assert.equal(p.top, 700 - 4 - 300);
});

test("the menu stays inside the viewport and may align to the trigger end", () => {
  assert.equal(place({ left: 950, top: 10, width: 40, height: 20 }).left, 1000 - 8 - 200);
  assert.equal(place({ left: 0, top: 10, width: 40, height: 20 }, menu, { align: "end" }).left, 8);
  assert.equal(place({ left: 500, top: 10, width: 40, height: 20 }, menu, { align: "end" }).left, 340);
});

test("the menu matches the trigger width or a minimum width", () => {
  assert.equal(place({ left: 0, top: 0, width: 400, height: 30 }, menu, { matchWidth: true, minWidth: 210 }).minWidth, 400);
  assert.equal(place({ left: 0, top: 0, width: 80, height: 30 }, menu, { matchWidth: true, minWidth: 210 }).minWidth, 210);
  assert.equal(place({ left: 0, top: 0, width: 400, height: 30 }, menu, { minWidth: 210 }).minWidth, 210);
});

test("a menu that fits on neither side takes the larger side and a max height", () => {
  const p = place({ left: 10, top: 500, width: 80, height: 30 }, { width: 200, height: 900 });
  assert.equal(p.above, true);
  assert.equal(p.maxHeight, 500 - 4 - 8);
  assert.equal(p.top, 8);
});
