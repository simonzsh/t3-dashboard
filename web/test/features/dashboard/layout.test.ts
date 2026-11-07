import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  CARD_TITLES,
  DEFAULT_LAYOUT,
  DASHBOARD_LAYOUT_KEY,
  dropCard,
  isDefaultLayout,
  layoutRows,
  loadLayout,
  resolveDrop,
  saveLayout,
  setHidden,
  shiftCard,
  toggleWidth,
  validateLayout,
  type DashboardLayout,
} from "../../../src/features/dashboard/layout.ts";
import { memoryStore } from "../../fixtures.ts";

const D = DEFAULT_LAYOUT;
const ids = (l: DashboardLayout) => l.order.map((p) => p.id);
const half = (id: string, column: string) => ({ id, width: "half", column });
// Usage alone, Activity full, then Running and Up next left of Server.
const Y = validateLayout({ order: [half("usage", "left"), { id: "activity", width: "full", column: "left" }, half("running", "left"), half("server", "right"), half("up-next", "left")], hidden: [] });
const col = (row: number, column: "left" | "right", index: number) => ({ kind: "column", row, column, index }) as const;
const gap = (row: number, column: "left" | "right" = "left") => ({ kind: "gap", row, column }) as const;

test("the default layout has Activity full, then two stacks of half cards", () => {
  assert.deepEqual(D, {
    order: [
      { id: "activity", width: "full", column: "left" },
      { id: "usage", width: "half", column: "left" },
      { id: "up-next", width: "half", column: "left" },
      { id: "running", width: "half", column: "right" },
      { id: "server", width: "half", column: "right" },
    ],
    hidden: [],
  });
  assert.deepEqual(layoutRows(D), [
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage", "up-next"], right: ["running", "server"] },
  ]);
  assert.equal(isDefaultLayout(validateLayout(null)), true);
});

test("full cards side by side leave no empty band, and half cards alone make one band", () => {
  const fulls = validateLayout({ order: [{ id: "activity", width: "full" }, { id: "usage", width: "full" }, { id: "server", width: "half" }] });
  assert.deepEqual(layoutRows({ ...fulls, order: fulls.order.slice(0, 2) }), [
    { kind: "full", card: "activity" },
    { kind: "full", card: "usage" },
  ]);
  const halves = validateLayout({ order: [half("usage", "right"), half("server", "left")] });
  assert.equal(layoutRows({ ...halves, order: halves.order.filter((p) => p.width === "half") }).length, 1);
});

test("the cards have their titles, and Notifications is not a card", () => {
  assert.deepEqual([CARD_TITLES.usage, CARD_TITLES.server, CARD_TITLES.activity, CARD_TITLES.running, CARD_TITLES["up-next"]], ["Usage", "Server", "Activity", "Running", "Up next"]);
  assert.equal("notifications" in CARD_TITLES, false);
});

test("an unreadable or foreign layout gives the default", () => {
  assert.deepEqual(validateLayout("junk"), D);
  assert.deepEqual(validateLayout({ left: ["usage"] }), D);
  assert.deepEqual(validateLayout({ order: "x" }), D);
});

test("a layout saved before widths existed becomes the default, keeping its hidden cards", () => {
  assert.deepEqual(validateLayout({ order: ["usage", "activity", "server", "running", "up-next"], hidden: [] }), D);
  const old = validateLayout({ order: ["usage", "activity", "server", "up-next"], hidden: ["running"] });
  assert.deepEqual(ids(old), ["activity", "usage", "up-next", "server"]);
  assert.deepEqual(old.hidden, ["running"]);
});

test("an old custom order keeps its sequence with the default widths", () => {
  const l = validateLayout({ order: ["running", "activity", "usage", "server"], hidden: ["up-next"] });
  assert.deepEqual(layoutRows(l), [
    { kind: "band", left: [], right: ["running"] },
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage"], right: ["server"] },
  ]);
  assert.deepEqual(ids(l), ["running", "activity", "usage", "server"]);
  assert.deepEqual(l.hidden, ["up-next"]);
});

test("a stored layout drops unknown cards, duplicates and bad values, and adds the missing cards", () => {
  const l = validateLayout({ order: [{ id: "server", width: "wide", column: "middle" }, { id: "nope" }, "usage", { id: "server", width: "full" }, 7, null, { id: "running", width: "full", column: "left" }], hidden: ["running", "usage", "x", "up-next", "up-next"] });
  assert.deepEqual(l.order, [
    { id: "usage", width: "half", column: "left" },
    { id: "server", width: "half", column: "right" },
    { id: "running", width: "full", column: "left" },
    { id: "activity", width: "full", column: "left" },
  ]);
  assert.deepEqual(l.hidden, ["up-next"]);
  assert.deepEqual(validateLayout({ order: [], hidden: "x" }).hidden, []);
});

test("a stored order is rebuilt band by band", () => {
  const l = validateLayout({ order: [half("usage", "left"), half("running", "right"), half("up-next", "left"), half("server", "right"), { id: "activity", width: "full" }] });
  assert.deepEqual(ids(l), ["usage", "up-next", "running", "server", "activity"]);
});

test("shiftCard moves a half card inside its stack", () => {
  assert.deepEqual(ids(shiftCard(D, "up-next", -1)), ["activity", "up-next", "usage", "running", "server"]);
  assert.deepEqual(ids(shiftCard(D, "server", -1)), ["activity", "usage", "up-next", "server", "running"]);
});

test("shiftCard moves a half card past the full card at the edge of its band", () => {
  const up = shiftCard(D, "usage", -1);
  assert.deepEqual(ids(up), ["usage", "activity", "up-next", "running", "server"]);
  assert.deepEqual(layoutRows(up), [
    { kind: "band", left: ["usage"], right: [] },
    { kind: "full", card: "activity" },
    { kind: "band", left: ["up-next"], right: ["running", "server"] },
  ]);
  assert.deepEqual(ids(shiftCard(Y, "running", -1)), ["usage", "running", "activity", "up-next", "server"]);
  assert.deepEqual(ids(shiftCard(Y, "server", -1)), ["usage", "server", "activity", "running", "up-next"]);
  const down = shiftCard(Y, "usage", 1);
  assert.deepEqual(ids(down), ["activity", "usage", "running", "up-next", "server"]);
  assert.deepEqual(layoutRows(down), [
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage", "running", "up-next"], right: ["server"] },
  ]);
});

test("shiftCard changes nothing at the ends of the dashboard or for a hidden card", () => {
  assert.equal(shiftCard(D, "up-next", 1), D);
  assert.equal(shiftCard(D, "server", 1), D);
  assert.equal(shiftCard(D, "activity", -1), D);
  const hidden = setHidden(D, "server", true);
  assert.equal(shiftCard(hidden, "server", -1), hidden);
});

test("shiftCard swaps a full card with the band or full card next to it", () => {
  assert.deepEqual(ids(shiftCard(D, "activity", 1)), ["usage", "up-next", "running", "server", "activity"]);
  assert.deepEqual(ids(shiftCard(Y, "activity", -1)), ["activity", "usage", "running", "up-next", "server"]);
  const full = toggleWidth(D, "server");
  const once = shiftCard(full, "server", -1);
  assert.deepEqual(ids(once), ["activity", "server", "usage", "up-next", "running"]);
  assert.deepEqual(ids(shiftCard(once, "server", -1)), ["server", "activity", "usage", "up-next", "running"]);
});

test("toggleWidth makes a half card full right after its band, and back", () => {
  const full = toggleWidth(D, "server");
  assert.deepEqual(ids(full), ["activity", "usage", "up-next", "running", "server"]);
  assert.deepEqual(full.order[4], { id: "server", width: "full", column: "right" });
  assert.deepEqual(layoutRows(full), [
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage", "up-next"], right: ["running"] },
    { kind: "full", card: "server" },
  ]);
  const back = toggleWidth(full, "server");
  assert.deepEqual(back, D);
  assert.equal(isDefaultLayout(back), true);
});

test("a full card made half joins the band below it", () => {
  assert.deepEqual(layoutRows(toggleWidth(D, "activity")), [{ kind: "band", left: ["activity", "usage", "up-next"], right: ["running", "server"] }]);
  const hidden = setHidden(D, "activity", true);
  assert.equal(toggleWidth(hidden, "activity"), hidden);
});

test("dropCard puts a half card in a column at an index", () => {
  const right = dropCard(D, "usage", col(1, "right", 1));
  assert.deepEqual(ids(right), ["activity", "up-next", "running", "usage", "server"]);
  assert.equal(right.order[3]!.column, "right");
  assert.equal(dropCard(D, "usage", col(1, "left", 0)), D);
  assert.equal(dropCard(D, "usage", col(1, "left", 1)), D);
  assert.deepEqual(ids(dropCard(D, "usage", col(1, "left", 2))), ["activity", "up-next", "usage", "running", "server"]);
  const left = dropCard(D, "server", col(1, "left", 2));
  assert.deepEqual(ids(left), ["activity", "usage", "up-next", "server", "running"]);
  assert.equal(left.order[3]!.column, "left");
});

test("dropCard puts a card in a gap between rows", () => {
  assert.deepEqual(ids(dropCard(D, "activity", gap(2))), ["usage", "up-next", "running", "server", "activity"]);
  assert.equal(dropCard(D, "activity", gap(0)), D);
  assert.equal(dropCard(D, "activity", gap(1)), D);
  assert.deepEqual(ids(dropCard(D, "running", gap(0, "right"))), ["running", "activity", "usage", "up-next", "server"]);
  assert.equal(dropCard(D, "usage", gap(0, "right")).order[0]!.column, "right");
  assert.deepEqual(dropCard(D, "running", gap(2)).order, dropCard(D, "running", col(1, "left", 2)).order);
  assert.equal(dropCard(D, "running", gap(2)).order.find((p) => p.id === "running")!.column, "left");
  assert.deepEqual(ids(dropCard(Y, "activity", gap(3))), ["usage", "running", "up-next", "server", "activity"]);
});

test("dropCard ignores a full card on a column and a hidden card", () => {
  assert.equal(dropCard(D, "activity", col(1, "left", 0)), D);
  const hidden = setHidden(D, "running", true);
  assert.equal(dropCard(hidden, "running", gap(0)), hidden);
});

test("resolveDrop turns a half card's gap next to a band into a column target", () => {
  assert.deepEqual(resolveDrop(D, "running", gap(2)), col(1, "left", 2));
  assert.deepEqual(resolveDrop(D, "running", gap(1, "right")), col(1, "right", 0));
  assert.deepEqual(resolveDrop(D, "activity", gap(2)), gap(2));
  const full = toggleWidth(D, "server");
  assert.deepEqual(resolveDrop(full, "running", gap(3)), gap(3));
});

test("hiding a card removes it from the order, and showing it puts it back at the end", () => {
  const hidden = setHidden(D, "running", true);
  assert.deepEqual(ids(hidden), ["activity", "usage", "up-next", "server"]);
  assert.deepEqual(hidden.hidden, ["running"]);
  assert.deepEqual(ids(setHidden(hidden, "running", false)), ["activity", "usage", "up-next", "server", "running"]);
  assert.deepEqual(ids(setHidden(setHidden(D, "activity", true), "activity", false)), ["usage", "up-next", "running", "server", "activity"]);
  assert.equal(setHidden(D, "running", false), D);
  assert.equal(setHidden(hidden, "running", true), hidden);
});

test("the layout is saved and loaded, and a broken value gives the default", () => {
  const storage = memoryStore();
  const moved = shiftCard(toggleWidth(D, "server"), "server", -1);
  saveLayout(storage, moved);
  assert.deepEqual(loadLayout(storage), moved);
  storage.data.set(DASHBOARD_LAYOUT_KEY, "{not json");
  assert.deepEqual(loadLayout(storage), D);
  assert.deepEqual(loadLayout(null), D);
});
