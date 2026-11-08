import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentSetupPage } from "../../../src/features/agent-setup/AgentSetupView.tsx";
import type { AgentSetupState } from "../../../src/features/agent-setup/useAgentSetup.ts";
import { inventory } from "./fixtures.ts";

const NOW = new Date("2026-11-08T10:05:00.000Z");
const state = (over: Partial<AgentSetupState> = {}): AgentSetupState => ({ value: inventory(), error: null, loading: false, mcp: null, refresh: () => {}, ...over });
const render = (s: AgentSetupState, compact = false) => renderToStaticMarkup(<AgentSetupPage state={s} projects={[]} compact={compact} now={NOW} />);

test("the user scope shows its files as a tree and the first file in the detail", () => {
  const out = render(state());
  assert.match(out, />~<.*>\.claude<.*>\.claude\.json</);
  assert.match(out, />CLAUDE\.md</);
  assert.match(out, /<h3 class="as-detail-path">~\/\.claude\/CLAUDE\.md<\/h3>/);
  assert.match(out, /No issues/);
  assert.match(out, /Read 5 min ago/);
});

test("the Files and Effective tabs only exist for a project", () => {
  assert.doesNotMatch(render(state()), /role="tablist"/);
});

test("a loading page with no data shows the loader, and a failed read shows the error", () => {
  const loading = render(state({ value: null, loading: true }));
  assert.doesNotMatch(loading, /id="as-view-panel"/);
  assert.match(render(state({ value: null, error: "boom" })), /Could not read the setup\. boom/);
});

test("a failed refresh keeps the last inventory next to the error", () => {
  const out = render(state({ error: "boom" }));
  assert.match(out, /role="alert"/);
  assert.match(out, /id="as-view-panel"/);
});

test("on a phone the detail is in a sheet and nothing is picked yet", () => {
  const out = render(state(), true);
  assert.doesNotMatch(out, /class="as-pane"/);
  assert.match(out, /ui-sheet wide"/);
  assert.doesNotMatch(out, /ui-sheet wide open/);
});

test("an issue count shows when a file has a problem", () => {
  const inv = inventory();
  inv.files["/home/u/.claude/CLAUDE.md"]!.issues = [{ code: "broken-import", severity: "warning", message: "Missing import" }];
  const out = render(state({ value: inv }));
  assert.match(out, /1 issue/);
  assert.match(out, /Missing import/);
});

test("the page uses the shared ListPage shell: the bar in its head, the tree and the file in its scroll box", () => {
  const out = render(state());
  assert.match(out, /<section class="list-page as-page" aria-label="Setup"><div class="list-page-head as-head">/);
  assert.match(out, /class="list-page-body page-scroll as-scroll"><div class="as-list"/);
});
