import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { SubagentState, TurnStep } from "../../../../shared/api.ts";
import { ApiProvider } from "../../../src/api/ApiContext.tsx";
import { SubagentRows } from "../../../src/features/conversation/SubagentRows.tsx";

const sub = (id: string, state: SubagentState, over: Partial<TurnStep["subagent"] & object> = {}, text = `Task ${id}`): TurnStep => ({
  id,
  runId: "run",
  kind: "subagent",
  status: state === "running" ? "running" : "done",
  startedAt: "2026-01-01T10:00:00Z",
  completedAt: state === "running" ? null : "2026-01-01T10:00:41Z",
  text,
  detail: state === "completed" ? "All good" : null,
  expandable: false,
  exitCode: null,
  subagent: { subagentId: id, childThreadId: "child", progress: state === "running" ? "Running Read a.ts" : null, stoppable: state === "running", state, provider: "claudeAgent", turnId: "t", ...over },
});

const render = (steps: TurnStep[], onOpenThread?: (id: string) => void) =>
  renderToStaticMarkup(
    <ApiProvider value={{} as never}>
      <SubagentRows steps={steps} threadId="t" onOpenThread={onOpenThread} onChanged={() => {}} />
    </ApiProvider>,
  );

test("one subagent is a bare row: no header, no card", () => {
  const out = render([sub("a", "running")], () => {});
  assert.doesNotMatch(out, /subagents|subagent-group|subagent-card/);
  assert.match(out, /Task a/);
  assert.match(out, /Running Read a\.ts/);
  assert.match(out, /aria-label="Open Task a"/);
  assert.match(out, /aria-label="Stop subagent"/);
});

test("a row without a child thread or handler is not a button and has no chevron", () => {
  const out = render([sub("a", "completed", { childThreadId: null })], () => {});
  assert.doesNotMatch(out, /aria-label="Open /);
  assert.doesNotMatch(out, /m9 18 6-6-6-6/);
  assert.doesNotMatch(render([sub("a", "completed")]), /aria-label="Open /);
});

test("a group shows its count and status, and keeps the rows hidden until opened", () => {
  const out = render([sub("a", "running"), sub("b", "completed"), sub("c", "completed"), sub("d", "failed")]);
  assert.match(out, /4 subagents/);
  assert.match(out, /1 working · 2 done · 1 failed/);
  assert.match(out, /\+1/);
  assert.match(out, /aria-expanded="false"/);
  assert.doesNotMatch(out, /subagent-card|Task a/);
});
