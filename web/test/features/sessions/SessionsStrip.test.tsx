import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionsStrip } from "../../../src/features/sessions/SessionsView.tsx";
import { EMPTY_SESSIONS, sessionsReducer, type SessionsState } from "../../../src/features/sessions/sessions.ts";
import type { SessionLayout } from "../../../src/lib/sessionLayout.ts";

const html = (sessions: SessionsState, layout: SessionLayout) => renderToStaticMarkup(<SessionsStrip windows={sessions.windows} layout={layout} render={(w) => <span>{w.id}</span>} />);

function cells(sessions: SessionsState, layout: SessionLayout) {
  return [...html(sessions, layout).matchAll(/grid-column:([^;]+);grid-row:([^";]+)[^"]*"[^>]*><span>([^<]+)<\/span>/g)].map(([, column, row, id]) => ({ id, column, row }));
}

const opened = (...ids: string[]) => ids.reduce((state, id) => sessionsReducer(state, { type: "open", id }), EMPTY_SESSIONS);

test("a swap changes the coordinates but not the order of the cells in the DOM", () => {
  const sessions = opened("b", "a", "d", "c");
  const swapped = sessionsReducer(sessions, { type: "swap", id: "b", with: "c" });
  for (const layout of ["columns", "grid"] as const) {
    const before = cells(sessions, layout);
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
  const sessions = opened("a", "b", "c");
  assert.match(html(sessions, "grid"), /grid-template-rows:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.deepEqual(cells(sessions, "grid").map((c) => [c.id, c.column, c.row]), [["a", "1", "1"], ["b", "1", "2"], ["c", "2", "1 / -1"]]);
});

test("only a session with another one under it gets the hairline below", () => {
  const out = html(opened("a", "b", "c"), "grid");
  assert.equal(out.match(/has-below/g)?.length, 1);
  assert.doesNotMatch(html(opened("a", "b", "c"), "columns"), /has-below/);
});
