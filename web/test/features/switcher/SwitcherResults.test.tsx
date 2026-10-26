import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SwitcherResults } from "../../../src/features/switcher/SwitcherResults.tsx";
import type { SwitcherRow } from "../../../src/features/switcher/switcher.ts";
import { thread } from "../../fixtures.ts";

const project = { id: "project-a", title: "Project A", icon: null };
const rows: SwitcherRow[] = [
  { thread: thread("t1", { title: "First" }), project },
  { thread: thread("t2", { title: "Second" }), project, snippet: "…found the needle here…", source: "assistant" },
];
const render = (over: Partial<Parameters<typeof SwitcherResults>[0]> = {}) =>
  renderToStaticMarkup(<SwitcherResults rows={rows} selected={1} now={new Date("2026-01-10T11:00:00.000Z")} loading={false} error={null} searched onSelect={() => {}} onOpen={() => {}} {...over} />);

test("each row shows its title, project and age; a content match shows its snippet", () => {
  const out = render();
  assert.match(out, /First/);
  assert.match(out, /Project A · 1 h ago/);
  assert.match(out, /…found the needle here…/);
  assert.equal(out.match(/switcher-snippet/g)?.length, 1);
});

test("the selected row is marked for assistive tech", () => {
  const out = render();
  assert.match(out, /id="switcher-option-t2"[^>]*aria-selected="true"/);
  assert.match(out, /id="switcher-option-t1"[^>]*aria-selected="false"/);
});

test("an error keeps the rows and adds one line", () => {
  const out = render({ error: "boom" });
  assert.match(out, /First/);
  assert.match(out, /Message search failed: boom/);
});

test("no rows after a search says so; before any search it stays quiet", () => {
  assert.match(render({ rows: [], selected: -1 }), /No conversations found/);
  assert.doesNotMatch(render({ rows: [], selected: -1, searched: false }), /No conversations/);
  assert.doesNotMatch(render({ rows: [], selected: -1, loading: true }), /No conversations/);
});
