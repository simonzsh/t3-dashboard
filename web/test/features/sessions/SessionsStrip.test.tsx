import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionsStrip } from "../../../src/features/sessions/SessionsView.tsx";
import { EMPTY_SESSIONS, sessionsReducer } from "../../../src/features/sessions/sessions.ts";
import type { SessionLayout } from "../../../src/lib/sessionLayout.ts";

const html = (ids: readonly string[], layout: SessionLayout) => renderToStaticMarkup(<SessionsStrip ids={ids} layout={layout} render={(id) => <span>{id}</span>} />);

function cells(ids: readonly string[], layout: SessionLayout) {
  return [...html(ids, layout).matchAll(/grid-column:([^;]+);grid-row:([^";]+)[^"]*"[^>]*><span>([^<]+)<\/span>/g)].map(([, column, row, id]) => ({ id, column, row }));
}

test("a swap changes the coordinates but not the order of the cells in the DOM", () => {
  const before = ["b", "a", "d", "c"].reduce((state, id) => sessionsReducer(state, { type: "open", id }), EMPTY_SESSIONS).ids;
  const after = sessionsReducer({ ...EMPTY_SESSIONS, ids: before }, { type: "swap", id: "b", with: "c" }).ids;
  for (const layout of ["columns", "grid"] as const) {
    const was = cells(before, layout);
    const now = cells(after, layout);
    assert.deepEqual(was.map((c) => c.id), ["a", "b", "c", "d"]);
    assert.deepEqual(now.map((c) => c.id), was.map((c) => c.id));
    for (const [id, from] of [["b", "c"], ["c", "b"], ["a", "a"], ["d", "d"]]) {
      const cell = now.find((c) => c.id === id)!;
      const previous = was.find((c) => c.id === from)!;
      assert.deepEqual([cell.column, cell.row], [previous.column, previous.row], `${layout} ${id}`);
    }
  }
});

test("column view has one row; grid view has two, and the odd last session spans both", () => {
  assert.match(html(["a", "b", "c"], "columns"), /grid-template-rows:repeat\(1, minmax\(0, 1fr\)\)/);
  assert.match(html(["a", "b", "c"], "grid"), /grid-template-rows:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.deepEqual(cells(["a", "b", "c"], "grid").map((c) => [c.id, c.column, c.row]), [["a", "1", "1"], ["b", "1", "2"], ["c", "2", "1 / -1"]]);
});

test("only a session with another one under it gets the hairline below", () => {
  assert.equal(html(["a", "b", "c"], "grid").match(/has-below/g)?.length, 1);
  assert.doesNotMatch(html(["a", "b", "c"], "columns"), /has-below/);
});

test("a cell is near only when pinned until the observer reports it", () => {
  const out = renderToStaticMarkup(<SessionsStrip ids={["a", "b", "c"]} layout="columns" pinned="b" render={(id, near) => <span>{`${id}:${near}`}</span>} />);
  assert.deepEqual([...out.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]), ["a:false", "b:true", "c:false"]);
});
