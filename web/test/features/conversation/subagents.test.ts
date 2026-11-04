import { test } from "bun:test";
import assert from "node:assert/strict";
import type { SubagentState, TurnStep } from "../../../../shared/api.ts";
import { groupElapsedMs, groupStatus, subagentLine } from "../../../src/features/conversation/subagents.ts";

const sub = (state: SubagentState, over: Partial<TurnStep> = {}, progress: string | null = null): TurnStep => ({
  id: state,
  runId: "run",
  kind: "subagent",
  status: "running",
  startedAt: "2026-01-01T10:00:00Z",
  completedAt: null,
  text: "Task",
  detail: null,
  expandable: false,
  exitCode: null,
  subagent: { subagentId: state, childThreadId: null, progress, stoppable: false, state, provider: null, turnId: null },
  ...over,
});

test("the status line counts each state and joins them", () => {
  assert.deepEqual(groupStatus([sub("running"), sub("waiting")]), { text: "2 working", tone: "active" });
  assert.deepEqual(groupStatus([sub("running"), sub("completed")]), { text: "1 working · 1 done", tone: "active" });
  assert.deepEqual(groupStatus([sub("completed"), sub("failed"), sub("stopped")]), { text: "1 done · 1 failed · 1 stopped", tone: "danger" });
  assert.deepEqual(groupStatus([sub("completed"), sub("stopped"), sub("idle")]), { text: "1 done · 1 stopped · 1 idle", tone: "muted" });
});

test("the group time runs from the first start to the last end, or to now while one works", () => {
  const done = [sub("completed", { completedAt: "2026-01-01T10:00:20Z" }), sub("completed", { startedAt: "2026-01-01T10:00:05Z", completedAt: "2026-01-01T10:00:45Z" })];
  assert.equal(groupElapsedMs(done, Date.parse("2026-01-01T11:00:00Z")), 45_000);
  assert.equal(groupElapsedMs([done[0]!, sub("running")], Date.parse("2026-01-01T10:00:30Z")), 30_000);
  assert.equal(groupElapsedMs([sub("running", { startedAt: "" })], 0), null);
});

test("the grey line shows the progress, else the result without markdown or T3 boilerplate", () => {
  assert.equal(subagentLine(sub("running", {}, "Running Read notes.md")), "Running Read notes.md");
  assert.equal(subagentLine(sub("completed", { detail: "## Summary\n- **Two** helpers in `format.ts` and [docs](http://x.test)" })), "Summary Two helpers in format.ts and docs");
  assert.equal(subagentLine(sub("stopped", { detail: "Child task ended with status interrupted" })), null);
  assert.equal(subagentLine(sub("queued")), null);
});
