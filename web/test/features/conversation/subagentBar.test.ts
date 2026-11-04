import assert from "node:assert/strict";
import { test } from "bun:test";
import { subagentStatus } from "../../../src/features/conversation/subagentBar.ts";

test("subagentStatus says how long a finished subagent took, or how long it has run", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  assert.equal(subagentStatus({ runId: "r", startedAt: "2026-11-04T11:50:00Z", completedAt: "2026-11-04T11:51:54Z" }, now), "Completed in 1m 54s");
  assert.equal(subagentStatus({ runId: "r", startedAt: "2026-11-04T11:59:48Z", completedAt: null }, now), "Running for 12s");
  assert.equal(subagentStatus({ runId: "r", startedAt: null, completedAt: null }, now), null);
  assert.equal(subagentStatus(null, now), null);
});
