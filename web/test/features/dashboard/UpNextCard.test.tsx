import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { BoardResult } from "../../../../shared/api.ts";
import { UpNextCard } from "../../../src/features/dashboard/UpNextCard.tsx";

const NOW = new Date("2026-11-06T12:05:00.000Z");
const board = (over: Partial<BoardResult> = {}): BoardResult => ({ configured: true, ok: true, error: null, issues: [], readAt: "2026-11-06T12:00:00.000Z", ...over });
const render = (value: BoardResult | null) =>
  renderToStaticMarkup(
    <UpNextCard
      board={value}
      now={NOW}
      needsKey={false}
      loading={false}
      failed={false}
      tickets={[]}
      relaunch={[]}
      onRefresh={() => {}}
      projects={[]}
      providers={[]}
      modelDefaults={{} as never}
      onOpen={() => {}}
      onStarted={() => {}}
    />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "");

test("the head shows the Linear status, then when Linear was read, then the refresh button", () => {
  const out = render(board());
  assert.match(text(out), /Updated 5 min ago/);
  assert.ok(out.indexOf("linear-source") < out.indexOf("Updated 5 min ago"));
  assert.ok(out.indexOf("Updated 5 min ago") < out.indexOf('aria-label="Refresh"'));
});

test("a board that failed still says when it was read; no board shows no time", () => {
  assert.match(text(render(board({ ok: false, error: "x" }))), /Updated 5 min ago/);
  assert.doesNotMatch(text(render(null)), /Updated/);
});
