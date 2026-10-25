import assert from "node:assert/strict";
import { test } from "bun:test";
import { filterOptions, moveActive, projectOptions, showsFilter } from "../src/dropdown.ts";

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
    { id: "p2", title: "beta", defaultModelSelection: null },
    { id: "p1", title: "Alpha", defaultModelSelection: null },
  ];
  assert.deepEqual(projectOptions(projects), [
    { id: "p1", label: "Alpha" },
    { id: "p2", label: "beta" },
  ]);
});
