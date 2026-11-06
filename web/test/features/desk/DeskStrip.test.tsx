import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DeskStrip } from "../../../src/features/desk/DeskView.tsx";
import { EMPTY_DESK, deskReducer, type DeskState } from "../../../src/features/desk/desk.ts";
import type { SessionLayout } from "../../../src/lib/sessionLayout.ts";

const html = (desk: DeskState, layout: SessionLayout) => renderToStaticMarkup(<DeskStrip windows={desk.windows} layout={layout} render={(w) => <span>{w.id}</span>} />);

function cells(desk: DeskState, layout: SessionLayout) {
  return [...html(desk, layout).matchAll(/grid-column:([^;]+);grid-row:([^";]+)[^"]*"[^>]*><span>([^<]+)<\/span>/g)].map(([, column, row, id]) => ({ id, column, row }));
}

const opened = (...ids: string[]) => ids.reduce((state, id) => deskReducer(state, { type: "open", id }), EMPTY_DESK);

test("a swap changes the coordinates but not the order of the cells in the DOM", () => {
  const desk = opened("b", "a", "d", "c");
  const swapped = deskReducer(desk, { type: "swap", id: "b", with: "c" });
  for (const layout of ["columns", "grid"] as const) {
    const before = cells(desk, layout);
    const after = cells(swapped, layout);
    assert.deepEqual(before.map((c) => c.id), ["a", "b", "c", "d"]);
    assert.deepEqual(after.map((c) => c.id), before.map((c) => c.id));
    for (const [id, from] of [["b", "c"], ["c", "b"], ["a", "a"], ["d", "d"]]) {
      const cell = after.find((c) => c.id === id)!;
      const previous = before.find((c) => c.id === from)!;
      assert.deepEqual([cell.column, cell.row], [previous.column, previous.row], `${layout} ${id}`);
    }
  }
});

test("column view puts every session in its own column of one row", () => {
  const out = html(opened("a", "b", "c"), "columns");
  assert.match(out, /grid-template-rows:repeat\(1, minmax\(0, 1fr\)\)/);
  assert.deepEqual(cells(opened("a", "b", "c"), "columns").map((c) => [c.id, c.column, c.row]), [["a", "1", "1"], ["b", "2", "1"], ["c", "3", "1"]]);
});

test("grid view stacks two sessions per column and the odd last one takes both rows", () => {
  const desk = opened("a", "b", "c");
  assert.match(html(desk, "grid"), /grid-template-rows:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.deepEqual(cells(desk, "grid").map((c) => [c.id, c.column, c.row]), [["a", "1", "1"], ["b", "1", "2"], ["c", "2", "1 / -1"]]);
});

test("only a session with another one under it gets the hairline below", () => {
  const out = html(opened("a", "b", "c"), "grid");
  assert.equal(out.match(/has-below/g)?.length, 1);
  assert.doesNotMatch(html(opened("a", "b", "c"), "columns"), /has-below/);
});
