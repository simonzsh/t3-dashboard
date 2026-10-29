import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DeskGrid } from "../../../src/features/desk/DeskView.tsx";
import { EMPTY_DESK, deskReducer, gridWindows, type DeskState } from "../../../src/features/desk/desk.ts";

function cells(desk: DeskState) {
  const html = renderToStaticMarkup(
    <DeskGrid windows={gridWindows(desk)} desk={desk} dispatch={() => {}} render={(w) => <span>{w.id}</span>} />,
  );
  return [...html.matchAll(/grid-column:([^;]+);grid-row:([^";]+)[^"]*"[^>]*><span>([^<]+)<\/span>/g)]
    .map(([, column, row, id]) => ({ id, column, row }));
}

test("une permutation change les coordonnées sans changer l’ordre des cellules dans le DOM", () => {
  const desk = ["b", "a", "d", "c"].reduce((state, id) => deskReducer(state, { type: "open", id }), EMPTY_DESK);
  const before = cells(desk);
  const after = cells(deskReducer(desk, { type: "swap", id: "b", with: "c" }));
  assert.equal(before.length, 4);
  assert.deepEqual(before.map((c) => c.id), ["a", "b", "c", "d"]);
  assert.deepEqual(after.map((c) => c.id), before.map((c) => c.id));
  for (const [id, from] of [["b", "c"], ["c", "b"], ["a", "a"], ["d", "d"]]) {
    const cell = after.find((c) => c.id === id)!;
    const previous = before.find((c) => c.id === from)!;
    assert.deepEqual([cell.column, cell.row], [previous.column, previous.row]);
  }
});
