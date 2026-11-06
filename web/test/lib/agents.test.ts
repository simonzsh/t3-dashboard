import { test } from "bun:test";
import assert from "node:assert/strict";
import { agentCounts } from "../../src/lib/agents.ts";
import { thread } from "../fixtures.ts";

const ask = { category: "approval" as const };

test("agentCounts counts waiting and working threads", () => {
  const counts = agentCounts([thread("a", { pending: ask }), thread("b", { status: "running" }), thread("c", { activeRunId: "r" }), thread("d", { status: "completed" }), thread("e")]);
  assert.deepEqual(counts, { waiting: 1, running: 2 });
});
