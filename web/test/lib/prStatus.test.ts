import { test } from "bun:test";
import assert from "node:assert/strict";
import { prStatus } from "../../src/lib/prStatus.ts";

test("PR states have distinct icons and colors, with final states before draft", () => {
  const states = ["open", "merged", "closed", "draft"];
  const results = states.map(state => prStatus({ state: state === "draft" ? "open" : state, draft: state === "draft" }));
  assert.equal(new Set(results.map(s => s.icon)).size, 4);
  assert.deepEqual(results.map(s => s.className), states.map(s => `pr-status-${s}`));
  assert.equal(prStatus({ state: "merged", draft: true }).label, "Merged");
  assert.equal(prStatus({ state: "closed", draft: true }).label, "Closed");
  assert.equal(prStatus({}).label, "Status unknown");
});
