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
  omitCard,
  restoreCard,
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
const Y = validateLayout({ order: [half("usage", "left"), { id: "activity", width: "full", column: "left" }, half("running", "left"), half("server", "right"), half("linear", "left")], hidden: [] });
const col = (row: number, column: "left" | "right", index: number) => ({ kind: "column", row, column, index }) as const;
const gap = (row: number, column: "left" | "right" = "left") => ({ kind: "gap", row, column }) as const;

test("the default layout has Activity full, then two stacks of half cards", () => {
  assert.deepEqual(D, {
    order: [
      { id: "activity", width: "full", column: "left" },
      { id: "usage", width: "half", column: "left" },
      { id: "running", width: "half", column: "right" },
      { id: "server", width: "half", column: "right" },
      { id: "linear", width: "half", column: "right" },
    ],
    hidden: [],
  });
  assert.deepEqual(layoutRows(D), [
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage"], right: ["running", "server", "linear"] },
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
  assert.deepEqual([CARD_TITLES.usage, CARD_TITLES.server, CARD_TITLES.activity, CARD_TITLES.running, CARD_TITLES.linear], ["Usage", "Server", "Activity", "Running", "Linear"]);
  assert.equal("notifications" in CARD_TITLES, false);
});

test("an unreadable or foreign layout gives the default", () => {
  assert.deepEqual(validateLayout("junk"), D);
  assert.deepEqual(validateLayout({ left: ["usage"] }), D);
  assert.deepEqual(validateLayout({ order: "x" }), D);
});

test("a layout saved before widths existed becomes the default, keeping its hidden cards", () => {
  assert.deepEqual(validateLayout({ order: ["usage", "activity", "server", "running", "linear"], hidden: [] }), D);
  const old = validateLayout({ order: ["usage", "activity", "server", "linear"], hidden: ["running"] });
  assert.deepEqual(ids(old), ["activity", "usage", "server", "linear"]);
  assert.deepEqual(old.hidden, ["running"]);
});

test("an old custom order keeps its sequence with the default widths", () => {
  const l = validateLayout({ order: ["running", "activity", "usage", "server"], hidden: ["linear"] });
  assert.deepEqual(layoutRows(l), [
    { kind: "band", left: [], right: ["running"] },
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage"], right: ["server"] },
  ]);
  assert.deepEqual(ids(l), ["running", "activity", "usage", "server"]);
  assert.deepEqual(l.hidden, ["linear"]);
});

test("a stored layout drops unknown cards, duplicates and bad values, and adds the missing cards", () => {
  const l = validateLayout({ order: [{ id: "server", width: "wide", column: "middle" }, { id: "nope" }, "usage", { id: "server", width: "full" }, 7, null, { id: "running", width: "full", column: "left" }], hidden: ["running", "usage", "x", "linear", "linear"] });
  assert.deepEqual(l.order, [
    { id: "usage", width: "half", column: "left" },
    { id: "server", width: "half", column: "right" },
    { id: "running", width: "full", column: "left" },
    { id: "activity", width: "full", column: "left" },
  ]);
  assert.deepEqual(l.hidden, ["linear"]);
  assert.deepEqual(validateLayout({ order: [], hidden: "x" }).hidden, []);
});

test("a stored order is rebuilt band by band", () => {
  const l = validateLayout({ order: [half("usage", "left"), half("running", "right"), half("linear", "left"), half("server", "right"), { id: "activity", width: "full" }] });
  assert.deepEqual(ids(l), ["usage", "linear", "running", "server", "activity"]);
});

test("shiftCard moves a half card inside its stack", () => {
  assert.deepEqual(ids(shiftCard(D, "linear", -1)), ["activity", "usage", "running", "linear", "server"]);
  assert.deepEqual(ids(shiftCard(D, "server", -1)), ["activity", "usage", "server", "running", "linear"]);
  assert.deepEqual(ids(shiftCard(D, "server", 1)), ["activity", "usage", "running", "linear", "server"]);
});

test("shiftCard moves a half card past the full card at the edge of its band", () => {
  const up = shiftCard(D, "usage", -1);
  assert.deepEqual(ids(up), ["usage", "activity", "running", "server", "linear"]);
  assert.deepEqual(layoutRows(up), [
    { kind: "band", left: ["usage"], right: [] },
    { kind: "full", card: "activity" },
    { kind: "band", left: [], right: ["running", "server", "linear"] },
  ]);
  assert.deepEqual(ids(shiftCard(D, "running", -1)), ["running", "activity", "usage", "server", "linear"]);
  assert.deepEqual(ids(shiftCard(Y, "running", -1)), ["usage", "running", "activity", "linear", "server"]);
  assert.deepEqual(ids(shiftCard(Y, "server", -1)), ["usage", "server", "activity", "running", "linear"]);
  const down = shiftCard(Y, "usage", 1);
  assert.deepEqual(ids(down), ["activity", "usage", "running", "linear", "server"]);
  assert.deepEqual(layoutRows(down), [
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage", "running", "linear"], right: ["server"] },
  ]);
});

test("shiftCard changes nothing at the ends of the dashboard or for a hidden card", () => {
  assert.equal(shiftCard(D, "linear", 1), D);
  assert.equal(shiftCard(D, "usage", 1), D);
  assert.equal(shiftCard(D, "activity", -1), D);
  const hidden = setHidden(D, "server", true);
  assert.equal(shiftCard(hidden, "server", -1), hidden);
});

test("shiftCard swaps a full card with the band or full card next to it", () => {
  assert.deepEqual(ids(shiftCard(D, "activity", 1)), ["usage", "running", "server", "linear", "activity"]);
  assert.deepEqual(ids(shiftCard(Y, "activity", -1)), ["activity", "usage", "running", "linear", "server"]);
  const full = toggleWidth(D, "linear");
  const once = shiftCard(full, "linear", -1);
  assert.deepEqual(ids(once), ["activity", "linear", "usage", "running", "server"]);
  assert.deepEqual(ids(shiftCard(once, "linear", -1)), ["linear", "activity", "usage", "running", "server"]);
});

test("toggleWidth makes a half card full right after its band, and back", () => {
  const full = toggleWidth(D, "linear");
  assert.deepEqual(ids(full), ["activity", "usage", "running", "server", "linear"]);
  assert.deepEqual(full.order[4], { id: "linear", width: "full", column: "right" });
  assert.deepEqual(layoutRows(full), [
    { kind: "full", card: "activity" },
    { kind: "band", left: ["usage"], right: ["running", "server"] },
    { kind: "full", card: "linear" },
  ]);
  const back = toggleWidth(full, "linear");
  assert.deepEqual(back, D);
  assert.equal(isDefaultLayout(back), true);
  // A card from the middle of a stack comes back at the bottom of its column.
  assert.deepEqual(ids(toggleWidth(toggleWidth(D, "server"), "server")), ["activity", "usage", "running", "linear", "server"]);
});

test("a full card made half joins the band below it", () => {
  assert.deepEqual(layoutRows(toggleWidth(D, "activity")), [{ kind: "band", left: ["activity", "usage"], right: ["running", "server", "linear"] }]);
  const hidden = setHidden(D, "activity", true);
  assert.equal(toggleWidth(hidden, "activity"), hidden);
});

test("dropCard puts a half card in a column at an index", () => {
  const right = dropCard(D, "usage", col(1, "right", 1));
  assert.deepEqual(ids(right), ["activity", "running", "usage", "server", "linear"]);
  assert.equal(right.order[2]!.column, "right");
  assert.equal(dropCard(D, "usage", col(1, "left", 0)), D);
  assert.equal(dropCard(D, "usage", col(1, "left", 1)), D);
  assert.equal(dropCard(D, "server", col(1, "right", 1)), D);
  assert.equal(dropCard(D, "server", col(1, "right", 2)), D);
  assert.deepEqual(ids(dropCard(D, "running", col(1, "right", 3))), ["activity", "usage", "server", "linear", "running"]);
  const left = dropCard(D, "server", col(1, "left", 1));
  assert.deepEqual(ids(left), ["activity", "usage", "server", "running", "linear"]);
  assert.equal(left.order[2]!.column, "left");
});

test("dropCard puts a card in a gap between rows", () => {
  assert.deepEqual(ids(dropCard(D, "activity", gap(2))), ["usage", "running", "server", "linear", "activity"]);
  assert.equal(dropCard(D, "activity", gap(0)), D);
  assert.equal(dropCard(D, "activity", gap(1)), D);
  assert.deepEqual(ids(dropCard(D, "running", gap(0, "right"))), ["running", "activity", "usage", "server", "linear"]);
  assert.equal(dropCard(D, "usage", gap(0, "right")).order[0]!.column, "right");
  assert.deepEqual(dropCard(D, "running", gap(2)).order, dropCard(D, "running", col(1, "left", 1)).order);
  assert.equal(dropCard(D, "running", gap(2)).order.find((p) => p.id === "running")!.column, "left");
  assert.deepEqual(ids(dropCard(Y, "activity", gap(3))), ["usage", "running", "linear", "server", "activity"]);
});

test("dropCard ignores a full card on a column and a hidden card", () => {
  assert.equal(dropCard(D, "activity", col(1, "left", 0)), D);
  const hidden = setHidden(D, "running", true);
  assert.equal(dropCard(hidden, "running", gap(0)), hidden);
});

test("resolveDrop turns a half card's gap next to a band into a column target", () => {
  assert.deepEqual(resolveDrop(D, "running", gap(2)), col(1, "left", 1));
  assert.deepEqual(resolveDrop(D, "running", gap(1, "right")), col(1, "right", 0));
  assert.deepEqual(resolveDrop(D, "activity", gap(2)), gap(2));
  const full = toggleWidth(D, "linear");
  assert.deepEqual(resolveDrop(full, "running", gap(3)), gap(3));
});

test("hiding a card removes it from the order, and showing it puts it back at the end", () => {
  const hidden = setHidden(D, "linear", true);
  assert.deepEqual(ids(hidden), ["activity", "usage", "running", "server"]);
  assert.deepEqual(hidden.hidden, ["linear"]);
  assert.deepEqual(setHidden(hidden, "linear", false), D);
  assert.deepEqual(ids(setHidden(setHidden(D, "running", true), "running", false)), ["activity", "usage", "server", "linear", "running"]);
  assert.deepEqual(ids(setHidden(setHidden(D, "activity", true), "activity", false)), ["usage", "running", "server", "linear", "activity"]);
  assert.equal(setHidden(D, "linear", false), D);
  assert.equal(setHidden(hidden, "linear", true), hidden);
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

test("a layout saved under the old card id keeps the place, width and column of the card", () => {
  const l = validateLayout({ order: [{ id: "activity", width: "full", column: "left" }, { id: "usage", width: "half", column: "left" }, { id: "up-next", width: "full", column: "right" }, half("running", "right"), half("server", "right")], hidden: [] });
  assert.deepEqual(ids(l), ["activity", "usage", "linear", "running", "server"]);
  assert.deepEqual(l.order.find((p) => p.id === "linear"), { id: "linear", width: "full", column: "right" });
});

test("a card hidden under the old id stays hidden", () => {
  const l = validateLayout({ order: [half("usage", "left"), { id: "activity", width: "full" }, half("running", "right"), half("server", "right")], hidden: ["up-next"] });
  assert.deepEqual(l.hidden, ["linear"]);
  assert.equal(ids(l).includes("linear"), false);
});

test("a layout holding both ids keeps the card once", () => {
  const l = validateLayout({ order: [half("up-next", "left"), half("linear", "right"), half("usage", "left")], hidden: ["up-next"] });
  assert.equal(ids(l).filter((id) => id === "linear").length, 1);
  assert.deepEqual(l.order.find((p) => p.id === "linear"), { id: "linear", width: "half", column: "left" });
  assert.deepEqual(l.hidden, []);
});

test("omitCard takes the card out of the order and leaves the hidden list alone", () => {
  assert.deepEqual(ids(omitCard(D, "linear")), ["activity", "usage", "running", "server"]);
  const hidden = setHidden(D, "linear", true);
  assert.equal(omitCard(hidden, "linear"), hidden);
  assert.deepEqual(omitCard(hidden, "running").hidden, ["linear"]);
});

test("restoreCard puts the omitted card back at its place after another change", () => {
  const view = omitCard(D, "linear");
  assert.deepEqual(restoreCard(D, view, "linear"), D);
  const moved = shiftCard(view, "server", -1);
  assert.deepEqual(ids(restoreCard(D, moved, "linear")), ["activity", "usage", "server", "linear", "running"]);
  assert.deepEqual(restoreCard(D, moved, "linear").order.find((p) => p.id === "linear"), { id: "linear", width: "half", column: "right" });
});

test("restoreCard follows the card that preceded it, or comes first", () => {
  const view = omitCard(D, "linear");
  const withoutServer = setHidden(view, "server", true);
  assert.deepEqual(ids(restoreCard(D, withoutServer, "linear")), ["activity", "usage", "running", "linear"]);
  const lead = validateLayout({ order: [{ id: "linear", width: "full", column: "left" }, half("usage", "left"), { id: "activity", width: "full" }, half("running", "right"), half("server", "right")] });
  assert.deepEqual(ids(restoreCard(lead, setHidden(omitCard(lead, "linear"), "running", true), "linear")), ["linear", "usage", "activity", "server"]);
});

test("restoreCard keeps a layout that lists the card in the order or the hidden list", () => {
  const shown = setHidden(setHidden(D, "linear", true), "linear", false);
  assert.equal(restoreCard(D, shown, "linear"), shown);
  const hidden = setHidden(D, "linear", true);
  assert.equal(restoreCard(D, hidden, "linear"), hidden);
});
